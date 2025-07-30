from dotenv import load_dotenv
load_dotenv()  # charge le fichier .env automatiquement

import os
from datetime import datetime
from fastapi import FastAPI, Query
from supabase import create_client

import httpx
# Configuration Supabase (variables chargées depuis .env)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Les variables SUPABASE_URL et SUPABASE_KEY ne sont pas définies.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Velov API")

from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- ROUTES ---

@app.get("/")
def home():
    return {"message": "API Velov opérationnelle !"}


@app.get("/stations")
def get_stations():
    """
    Retourne toutes les stations avec leurs infos statiques
    """
    response = supabase.table("stations").select("*").execute()
    return response.data

@app.get("/status/latest")
def get_latest_status():
    response = supabase.from_("latest_station_status").select("*").execute()
    return response.data






@app.get("/status/{station_id}")
def get_station_history(
    station_id: str,
    start: datetime = Query(None, description="Filtre date début (YYYY-MM-DD)"),
    end: datetime = Query(None, description="Filtre date fin (YYYY-MM-DD)")
):
    """
    Retourne l'historique des statuts pour une station donnée
    """
    query = supabase.table("station_status_logs").select("*").eq("station_id", station_id)

    if start:
        query = query.gte("timestamp", start.isoformat())
    if end:
        query = query.lte("timestamp", end.isoformat())

    response = query.order("timestamp", desc=False).execute()
    return response.data
