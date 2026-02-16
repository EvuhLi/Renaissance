from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Import the 'app' objects from your files
from tagging import app as tagging_app
from recommendation import app as rec_app

app = FastAPI(title="Loom ML Suite")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instead of mounting, we just link the routes directly
app.include_router(tagging_app.router, prefix="/tagging", tags=["Tagging"])
app.include_router(rec_app.router, prefix="/recommendation", tags=["Recommendation"])

@app.get("/")
async def root():
    return {"status": "online", "modules": ["tagging", "recommendation"]}