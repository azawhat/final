# recommender.py (дополненный с коллаб фильтрацией)

import json
import sys
from collections import Counter

def load_data():
    raw_input = sys.stdin.read()
    data = json.loads(raw_input)
    return data["currentUser"], data["allUsers"], data["events"]

def jaccard_similarity(set1, set2):
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    return intersection / union if union != 0 else 0

def content_score(user_tags, event_tags):
    if not user_tags or not event_tags:
        return 0
    common = set(user_tags) & set(event_tags)
    return len(common) / len(set(user_tags))

def hybrid_score(event, user_tags, alpha=0.7):
    content = content_score(user_tags, event.get("tags", []))
    rating = event.get("eventRating", 0) / 5
    return alpha * content + (1 - alpha) * rating

def collaborative_filter(current_user, all_users):
    current_set = set(current_user["registeredEvents"])
    similarity_scores = []
    for user in all_users:
        if user["id"] == current_user["id"]:
            continue
        sim = jaccard_similarity(current_set, set(user["registeredEvents"]))
        similarity_scores.append((user, sim))
    similarity_scores.sort(key=lambda x: x[1], reverse=True)

    top_users = [user for user, score in similarity_scores[:3] if score > 0]
    event_counts = Counter()
    for user in top_users:
        for event_id in user["registeredEvents"]:
            if event_id not in current_set:
                event_counts[event_id] += 1
    return event_counts

def recommend(current_user, all_users, events):
    user_tags = current_user.get("interestedTags", [])
    collab_scores = collaborative_filter(current_user, all_users)

    for event in events:
        score_content = hybrid_score(event, user_tags)
        score_collab = collab_scores.get(event["id"], 0) / 3  # нормализуем
        event["score"] = 0.6 * score_content + 0.4 * score_collab

    return sorted(events, key=lambda x: x["score"], reverse=True)

if __name__ == "__main__":
    current_user, all_users, events = load_data()
    recommendations = recommend(current_user, all_users, events)
    print(json.dumps(recommendations, indent=2))
