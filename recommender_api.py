# recommender_api.py
from fastapi import FastAPI, Request
from pydantic import BaseModel
from typing import List, Dict
from recommender import recommend  # файл с твоим алгоритмом

app = FastAPI()

class User(BaseModel):
    id: str
    interestedTags: List[str]
    registeredEvents: List[str]

class Event(BaseModel):
    id: str
    tags: List[str]
    eventRating: float

@app.post("/recommend")
async def get_recommendation(request: Request):
    data = await request.json()
    current_user = data["currentUser"]
    all_users = data["allUsers"]
    events = data["events"]
    recommended = recommend(current_user, all_users, events)
    return recommended
