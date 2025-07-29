<script lang="ts">
  import { onMount } from "svelte";

  let map: any;
  let stationsData: any[] = [];
  let searchTerm = "";
  let filteredStations: any[] = [];
  let selectedStation: any = null; // station sélectionnée

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

  function updateFilteredStations() {
    const term = searchTerm.toLowerCase();
    if (!term) {
      filteredStations = [];
      return;
    }
    filteredStations = stationsData
      .filter((s) => s.name.toLowerCase().includes(term))
      .slice(0, 3);
  }

  function selectStation(station: any) {
    selectedStation = station;
    filteredStations = [];

    // Zoom sur la station
    if (station.lat && station.lon) {
      map.setView([station.lat, station.lon], 16);
    }
  }

  onMount(async () => {
    const L = await import("leaflet");
    await import("leaflet/dist/leaflet.css");

    map = L.map("map").setView([45.7578, 4.832], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    stationsData = await loadData();

    stationsData.forEach((s: any) => {
      if (!s.lat || !s.lon) return;

      const bikes = s.status?.num_bikes_available ?? 0;
      const docks = s.status?.num_docks_available ?? 0;
      const color = bikes > 2 ? "green" : "red";
      const icon = L.divIcon({
        className: "custom-icon",
        html: `<div style="background:${color};width:12px;height:12px;border-radius:50%"></div>`,
      });

      const marker = L.marker([s.lat, s.lon], { icon }).addTo(map);
      marker.on("click", () => selectStation(s));
    });
  });
</script>

<div id="map" style="height:100vh;"></div>

<!-- Barre de recherche -->
<div class="search-container">
  <input
    type="text"
    placeholder="Rechercher une station..."
    bind:value={searchTerm}
    on:input={updateFilteredStations}
  />
  {#if filteredStations.length > 0}
    <div class="search-results">
      {#each filteredStations as s}
        <div on:click={() => selectStation(s)}>
          {s.name}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Modale à droite -->
{#if selectedStation}
  <div class="right-panel">
    <h2>{selectedStation.name}</h2>
    {#if selectedStation.status}
      <p>
        <strong>Vélos mécaniques :</strong>
        {selectedStation.status.num_bikes_mechanical}
      </p>
      <p>
        <strong>Vélos électriques :</strong>
        {selectedStation.status.num_bikes_ebike}
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
  </div>
{/if}

<style>
  .search-container {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 8px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    width: 300px;
  }
  .search-results {
    background: white;
    border-top: 1px solid #ddd;
    max-height: 150px;
    overflow-y: auto;
  }
  .search-results div {
    padding: 8px;
    cursor: pointer;
  }
  .search-results div:hover {
    background: #eee;
  }

  .right-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 350px;
    height: 100%;
    background: white;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2);
    padding: 20px;
    overflow-y: auto;
  }
</style>
