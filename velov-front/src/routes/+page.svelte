<script lang="ts">
  import { onMount } from "svelte";
  import { Chart, registerables } from "chart.js";
  Chart.register(...registerables);

  let map: any;
  let stationsData: any[] = [];
  let selectedStation: any = null;
  let searchTerm = "";
  let searchResults: any[] = [];

  // Chart.js state
  let chart: Chart | null = null;
  let startDate = "";
  let endDate = "";

  async function loadData() {
    const [stationsRes, statusRes] = await Promise.all([
      fetch("http://127.0.0.1:8000/stations"),
      fetch("http://127.0.0.1:8000/status/latest"),
    ]);

    const stations = await stationsRes.json();
    const statuses = await statusRes.json();

    const statusMap = new Map(statuses.map((s: any) => [s.station_id, s]));
    return stations.map((st: any) => ({
      ...st,
      status: statusMap.get(st.station_id),
    }));
  }

  async function loadHistory(stationId: string) {
    if (!stationId) return [];
    let url = `http://127.0.0.1:8000/status/${stationId}`;
    const params: string[] = [];
    if (startDate) params.push(`start=${encodeURIComponent(startDate)}`);
    if (endDate) params.push(`end=${encodeURIComponent(endDate)}`);
    if (params.length > 0) url += "?" + params.join("&");

    const res = await fetch(url);
    return res.json();
  }

  async function updateChart() {
    if (!selectedStation) return;
    const data = await loadHistory(selectedStation.station_id);
    if (!data || data.length === 0) return;

    const labels = data.map((d: any) =>
      new Date(d.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );

    const ctx = (
      document.getElementById("historyChart") as HTMLCanvasElement
    ).getContext("2d");

    if (chart) {
      chart.destroy();
    }

    const bikes = data.map((d: any) => d.num_bikes_available);
    const docks = data.map((d: any) => d.num_docks_available);

    chart = new Chart(ctx!, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Vélos disponibles",
            data: bikes,
            borderColor: "green",
            backgroundColor: "rgba(0,255,0,0.1)",
          },
          {
            label: "Places libres",
            data: docks,
            borderColor: "red",
            backgroundColor: "rgba(255,0,0,0.1)",
          },
        ],
      },
    });
  }

  function selectStation(station: any) {
    selectedStation = station;
    searchTerm = "";
    searchResults = [];

    if (station.lat && station.lon) {
      map.setView([station.lat, station.lon], 16);
    }

    // Met à jour le graphique
    updateChart();
  }

  function updateSearchResults() {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      searchResults = [];
      return;
    }
    searchResults = stationsData
      .filter((s) => s.name.toLowerCase().includes(term))
      .slice(0, 5);
  }

  onMount(async () => {
    const L = await import("leaflet");
    await import("leaflet/dist/leaflet.css");

    map = L.map("map", {
      zoomControl: true,
    }).setView([45.7578, 4.832], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    stationsData = await loadData();

    stationsData.forEach((s: any) => {
      if (!s.lat || !s.lon) return;

      const bikes = s.status?.num_bikes_available ?? 0;
      const color = bikes > 2 ? "green" : "red";

      const iconHtml = `
        <div class="marker-icon" style="
          background:${color};
          width:20px;
          height:20px;
          border-radius:50%;
          border: 2px solid white;
          transition: transform 0.2s ease;
        "></div>
      `;

      const icon = L.divIcon({
        className: "custom-icon",
        html: iconHtml,
      });

      const marker = L.marker([s.lat, s.lon], { icon }).addTo(map);

      marker.on("click", () => selectStation(s));

      marker.on("mouseover", () => {
        const el = marker
          .getElement()
          ?.querySelector(".marker-icon") as HTMLElement;
        if (el) el.style.transform = "scale(1.5)";
      });

      marker.on("mouseout", () => {
        const el = marker
          .getElement()
          ?.querySelector(".marker-icon") as HTMLElement;
        if (el) el.style.transform = "scale(1)";
      });
    });
  });
</script>

<div class="container">
  <!-- Colonne gauche -->
  <div class="left-panel">
    <h2>Historique</h2>
    {#if selectedStation}
      <div style="margin-top:10px">
        <label>
          Date début:
          <input
            type="datetime-local"
            bind:value={startDate}
            on:change={updateChart}
          />
        </label>
        <br />
        <label>
          Date fin:
          <input
            type="datetime-local"
            bind:value={endDate}
            on:change={updateChart}
          />
        </label>
      </div>
      <div style="height: 300px; margin-top:20px;">
        <canvas id="historyChart"></canvas>
      </div>
    {:else}
      <p>Sélectionne une station pour voir l'historique</p>
    {/if}
  </div>

  <!-- Carte au centre -->
  <div class="center-panel">
    <div class="search-box">
      <input
        type="text"
        placeholder="Rechercher une station..."
        bind:value={searchTerm}
        on:input={updateSearchResults}
        style="width:100%; padding:5px;"
      />
      {#if searchResults.length > 0}
        <div class="search-results">
          {#each searchResults as s}
            <div on:click={() => selectStation(s)}>
              {s.name}
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <div id="map"></div>
  </div>

  <!-- Colonne droite -->
  <div class="right-panel">
    {#if selectedStation}
      <h2>{selectedStation.name}</h2>
      {#if selectedStation.status}
        <p>
          <strong>Vélos disponibles :</strong>
          {selectedStation.status.num_bikes_available}
        </p>

        <p>
          <strong>Places libres :</strong>
          {selectedStation.status.num_docks_available}
        </p>
        <p><strong>Capacité totale :</strong> {selectedStation.capacity}</p>
        <p>
          <strong>Mise à jour :</strong>
          {new Date(selectedStation.status.timestamp).toLocaleString()}
        </p>
      {:else}
        <p>Données en cours de chargement…</p>
      {/if}
    {:else}
      <p>Sélectionne une station pour voir les détails</p>
    {/if}
  </div>
</div>

<style>
  .container {
    display: flex;
    height: 100vh;
    width: 100vw;
  }

  .left-panel,
  .right-panel {
    width: 20%;
    padding: 10px;
    background: #f7f7f7;
    overflow-y: auto;
  }

  .center-panel {
    width: 60%;
    position: relative;
  }

  #map {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .custom-icon {
    cursor: pointer;
  }

  /* Barre de recherche */
  .search-box {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    width: 300px;
    z-index: 1000;
  }

  .search-results {
    margin-top: 5px;
    border: 1px solid #ccc;
    border-radius: 6px;
    max-height: 200px;
    overflow-y: auto;
    background: white;
  }

  .search-results div {
    padding: 8px;
    cursor: pointer;
  }

  .search-results div:hover {
    background: #eee;
  }
</style>
