from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_KEY"]

supabase = create_client(url, key)

res = supabase.table("latest_station_status").select("*").limit(5).execute()
print(len(res.data))
print(res.data)
