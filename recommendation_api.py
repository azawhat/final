import sys
import json
from recommendation_system import EventRecommender
from dotenv import load_dotenv
import os
def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Usage: python recommendation_api.py <user_id> or --retrain"}))
            sys.exit(1)
        
        arg = sys.argv[1]
        print(f"Starting process for: {arg}", file=sys.stderr)
        uri = os.getenv("MONGO_URI")
        recommender = EventRecommender(uri)
        
        if arg == "--retrain":
            print("Retraining model...", file=sys.stderr)
            try:
                result = recommender.retrain_model()
                print(json.dumps(result))
            except Exception as e:
                print(json.dumps({
                    "error": str(e),
                    "type": "retrain_error"
                }), file=sys.stderr)
                sys.exit(1)
        else:
            user_id = arg
            print(f"Processing user: {user_id}", file=sys.stderr)
            
            try:
                user = recommender.get_user_data(user_id)
                print(f"User found: {user['username']}", file=sys.stderr)
                
                try:
                    recommendations = recommender.get_recommendations(user_id, n=10)
                    print(json.dumps({
                        "user_id": user_id,
                        "username": user['username'],
                        "recommendations": recommendations,
                        "status": "success"
                    }))
                except Exception as e:
                    print(json.dumps({
                        "error": f"Recommendation generation failed: {str(e)}",
                        "type": "recommendation_error",
                        "user_id": user_id
                    }), file=sys.stderr)
                    sys.exit(1)
                    
            except ValueError as e:
                print(json.dumps({
                    "error": str(e),
                    "type": "user_error",
                    "suggestion": "Check if user exists in database"
                }), file=sys.stderr)
                sys.exit(1)
                
    except Exception as e:
        print(json.dumps({
            "error": f"System error: {str(e)}",
            "type": "system_error"
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()