<script lang="ts">
  import { onMount } from "svelte";
  import { Chart, registerables } from "chart.js";
  Chart.register(...registerables);

  let stationsData: any[] = [];
  let selectedStation: any = null;
  let searchTerm = "";
  let searchResults: any[] = [];

  // Chart.js state
  let chart: Chart | null = null;
  let startDate = "";
  let endDate = "";
  let showHeatmap = false;

  // Pour les markers classiques
  let markers: L.Marker[] = [];

  // Pour la heatmap
  let heatLayer: L.HeatLayer | null = null;

  // Pour le slider temporel
  let selectedHour = 8;

  // Données globales
  let historicalData: any[] = []; // Ce tableau sera rempli quand on fera le back

  let map: any = null; // La carte Leaflet
  let L: any = null; // Leaflet sera importé dynamiquement

  onMount(async () => {
    await import("leaflet/dist/leaflet.css");

    const leaflet = await import("leaflet");
    await import("leaflet.heat");
    L = leaflet.default;

    // Initialisation de la carte après import client-only
    map = L.map("map").setView([45.75, 4.85], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
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

  async function loadData() {
    const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

    const [stationsRes, statusRes] = await Promise.all([
      fetch(`${API_BASE}/stations`),
      fetch(`${API_BASE}/status/latest`),
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

  function renderMarkers() {
    // Supprime anciens markers
    markers.forEach((m) => map.removeLayer(m));
    markers = [];

    stationsData.forEach((st) => {
      const marker = L.marker([st.lat, st.lon]);
      marker.addTo(map);
      markers.push(marker);
    });
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
    updateAllCharts();
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

  let hoursChart: Chart | null = null;
  let donutChart: Chart | null = null;
  let volatilityEvents: any[] = [];

  async function updateAllCharts() {
    if (!selectedStation) return;

    const data = await loadHistory(selectedStation.station_id);
    if (!data || data.length === 0) return;

    updateHistoryChart(data);
    updateHoursChart(data);
    updateDonutChart(data);
    computeVolatility(data);
  }

  function updateHistoryChart(data: any[]) {
    const labels = data.map((d: any) =>
      new Date(d.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
    const bikes = data.map((d: any) => d.num_bikes_available);
    const docks = data.map((d: any) => d.num_docks_available);

    const ctx = (
      document.getElementById("historyChart") as HTMLCanvasElement
    ).getContext("2d");
    if (chart) chart.destroy();
    chart = new Chart(ctx!, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Vélos",
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
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function updateHoursChart(data: any[]) {
    const hours = Array(24)
      .fill(0)
      .map((_, h) => {
        const subset = data.filter(
          (d) => new Date(d.timestamp).getHours() === h
        );
        if (subset.length === 0) return 0;
        const avg =
          subset.reduce((acc, d) => acc + d.num_bikes_available, 0) /
          subset.length;
        return avg;
      });

    const ctx = (
      document.getElementById("hoursChart") as HTMLCanvasElement
    ).getContext("2d");
    if (hoursChart) hoursChart.destroy();
    hoursChart = new Chart(ctx!, {
      type: "bar",
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
        datasets: [
          {
            label: "Moyenne vélos / heure",
            data: hours,
            backgroundColor: "rgba(0,0,255,0.5)",
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function updateDonutChart(data: any[]) {
    const avgBikes =
      data.reduce((acc, d) => acc + d.num_bikes_available, 0) / data.length;
    const capacity =
      data[0]?.capacity ||
      avgBikes +
        data.reduce((acc, d) => acc + d.num_docks_available, 0) / data.length;
    const avgDocks = capacity - avgBikes;

    const ctx = (
      document.getElementById("donutChart") as HTMLCanvasElement
    ).getContext("2d");
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(ctx!, {
      type: "doughnut",
      data: {
        labels: ["Vélos", "Places libres"],
        datasets: [
          { data: [avgBikes, avgDocks], backgroundColor: ["green", "red"] },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function computeVolatility(data: any[]) {
    volatilityEvents = [];
    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(
        data[i].num_bikes_available - data[i - 1].num_bikes_available
      );
      if (diff >= 5) {
        // seuil : changement rapide >= 5
        volatilityEvents.push({ timestamp: data[i].timestamp, delta: diff });
      }
    }
  }
  function toggleHeatmap() {
    showHeatmap = !showHeatmap;

    if (showHeatmap) {
      // Enlève les markers
      markers.forEach((m) => map.removeLayer(m));
      updateHeatmap();
    } else {
      // Remet les markers
      renderMarkers();
      if (heatLayer) {
        map.removeLayer(heatLayer);
      }
    }
  }

  function updateHeatmap() {
    const heatData = stationsData.map((st) => [
      st.lat,
      st.lon,
      st.status?.num_bikes_available || 0,
    ]);

    if (heatLayer) {
      heatLayer.setLatLngs(heatData);
    } else {
      heatLayer = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
      }).addTo(map);
    }
  }
  function updateHeatmapByHour() {
    // On suppose que `historicalData` contient
    // toutes les stations pour toutes les heures
    const filtered = historicalData
      .filter((d) => new Date(d.timestamp).getHours() === selectedHour)
      .map((d) => [d.lat, d.lon, d.num_bikes_available]);

    if (heatLayer) {
      heatLayer.setLatLngs(filtered);
    }
  }
</script>

<div class="container">
  <!-- Colonne gauche -->
  <div class="left-panel">
    {#if selectedStation}
      <div class="stats-header">
        <h2>Statistiques</h2>
        <div class="date-filters">
          <label>
            Début
            <input
              type="datetime-local"
              bind:value={startDate}
              on:change={updateAllCharts}
            />
          </label>
          <label>
            Fin
            <input
              type="datetime-local"
              bind:value={endDate}
              on:change={updateAllCharts}
            />
          </label>
        </div>
      </div>

      <div class="chart-container large">
        <canvas id="historyChart"></canvas>
      </div>

      <div class="chart-container medium">
        <canvas id="hoursChart"></canvas>
      </div>

      <div class="chart-container medium">
        <canvas id="donutChart"></canvas>
      </div>
    {:else}
      <div class="stats-placeholder">
        <h2>Statistiques</h2>
        <p>Sélectionnez une station pour voir les données</p>
      </div>
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
        style="width:100%; padding:5px; width: 96%;"
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
    <div class="heatmap-toggle">
      <button on:click={toggleHeatmap}>
        {showHeatmap ? "Vue classique" : "Vue heatmap"}
      </button>
    </div>
    {#if showHeatmap}
      <div class="time-slider">
        <input
          type="range"
          min="0"
          max="23"
          bind:value={selectedHour}
          on:input={updateHeatmapByHour}
        />
        <span>{selectedHour}:00</span>
      </div>
    {/if}

    <div id="map"></div>
  </div>

  <!-- Colonne droite -->
  <!-- Colonne droite -->
  <div class="right-panel">
    {#if selectedStation}
      <div class="station-info">
        <h3>{selectedStation.name}</h3>
        <p>
          <strong>Vélos disponibles :</strong>
          {selectedStation.status.num_bikes_available}
        </p>
        <p>
          <strong>Places libres :</strong>
          {selectedStation.status.num_docks_available}
        </p>
        <p><strong>Capacité totale :</strong> {selectedStation.capacity}</p>
        <p class="update-time">
          Mise à jour : {new Date(
            selectedStation.status.timestamp
          ).toLocaleString()}
        </p>
      </div>
    {:else}
      <div class="station-placeholder">
        <p>Sélectionnez une station sur la carte</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .time-slider {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .heatmap-toggle {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 1200;
  }
  .heatmap-toggle button {
    padding: 8px 12px;
    border-radius: 6px;
    border: none;
    background: #333;
    color: white;
    cursor: pointer;
  }

  .container {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .left-panel {
    width: 25%;
    padding: 15px;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    gap: 15px;
    overflow: hidden;
  }

  .right-panel {
    width: 15%;
    padding: 15px;
    background: #fdfdfd;
    border-left: 1px solid #ddd;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }

  .station-info h3 {
    font-size: 18px;
    margin-bottom: 10px;
  }
  .station-info p {
    font-size: 14px;
    margin: 4px 0;
  }
  .update-time {
    margin-top: 10px;
    font-style: italic;
    font-size: 12px;
    color: #666;
  }

  .center-panel {
    width: 60%;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  #map {
    flex: 1;
  }

  .stats-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .date-filters {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .date-filters label {
    display: flex;
    flex-direction: column;
    font-size: 14px;
  }

  .chart-container {
    background: white;
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    flex-shrink: 0;
  }
  .chart-container.large {
    height: 250px;
  }
  .chart-container.medium {
    height: 200px;
  }

  .stats-placeholder,
  .station-placeholder {
    text-align: center;
    color: #777;
    margin-top: 50%;
  }

  /* Barre de recherche améliorée */
  .search-box {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 8px;
    border-radius: 10px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    width: 300px;
    z-index: 1000;
  }

  .search-box input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 8px;
    outline: none;
    font-size: 14px;
  }

  .search-results {
    margin-top: 5px;
    border: 1px solid #ccc;
    border-radius: 8px;
    max-height: 250px;
    overflow-y: auto;
    background: white;
  }

  .search-results div {
    padding: 8px;
    cursor: pointer;
  }

  .search-results div:hover {
    background: #f0f0f0;
  }
</style>
