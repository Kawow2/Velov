import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service_role key

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GBFS_URL = "https://download.data.grandlyon.com/files/rdata/jcd_jcdecaux.jcdvelov/gbfs.json";

async function fetchGbfsUrls() {
  const gbfs = await (await fetch(GBFS_URL)).json();
  const feeds = gbfs.data.fr.feeds;
  const infoUrl = feeds.find(f => f.name === "station_information").url;
  const statusUrl = feeds.find(f => f.name === "station_status").url;
  return { infoUrl, statusUrl };
}

async function updateStations(infoUrl) {
  const infoData = await (await fetch(infoUrl)).json();
  const stations = infoData.data.stations;

  for (const s of stations) {
    await supabase.from("stations")
      .upsert({
        station_id: s.station_id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        capacity: s.capacity,
        address: s.address
      });
  }
  console.log(`Mise à jour des stations (${stations.length})`);
}

async function insertStationStatus(statusUrl) {
  const statusData = await (await fetch(statusUrl)).json();
  const stations = statusData.data.stations;

  const rows = stations.map(s => ({
    station_id: s.station_id,
    num_bikes_available: s.num_bikes_available,
    num_bikes_mechanical: s.num_bikes_available_types?.[0]?.mechanical ?? 0,
    num_bikes_ebike: s.num_bikes_available_types?.[0]?.ebike ?? 0,
    num_docks_available: s.num_docks_available,
    is_installed: s.is_installed === 1,
    is_renting: s.is_renting === 1,
    is_returning: s.is_returning === 1,
    last_reported: new Date(s.last_reported * 1000).toISOString(),
    status: s.status
  }));

  const { error } = await supabase.from("station_status_logs").insert(rows);
  if (error) {
    console.error("Erreur d’insertion :", error);
  } else {
    console.log(`Insertion de ${rows.length} statuts`);
  }
}

async function main() {
  const { infoUrl, statusUrl } = await fetchGbfsUrls();
  await updateStations(infoUrl);       // Une fois suffit, mais pas grave si ça tourne
  await insertStationStatus(statusUrl);
}

main().catch(console.error);
