import pymongo
from pymongo import MongoClient
from bson import ObjectId
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel
from collections import defaultdict
import numpy as np
import joblib
import os
from datetime import datetime
import traceback
import re

class EventRecommender:
    def __init__(self, mongo_uri):
        self.client = MongoClient(mongo_uri)
        self.db = self.client.get_database()
        self.model_path = 'recommendation_model.joblib'
        
        if os.path.exists(self.model_path):
            self.model_data = joblib.load(self.model_path)
        else:
            self.model_data = {
                'user_profiles': {},
                'event_profiles': {},
                'last_retraining': None,
                'tfidf_vectorizer': None,
                'tfidf_matrix': None
            }
    
    def save_model(self):
        joblib.dump(self.model_data, self.model_path)
    
    def get_user_data(self, user_id):
        """Получаем данные пользователя из MongoDB"""
        try:
            user = self.db.users.find_one({"_id": ObjectId(user_id)})
            if not user:
                raise ValueError(f"User with id {user_id} not found")
            return user
        except Exception as e:
            raise ValueError(f"Error fetching user: {str(e)}")

    def get_all_events(self, exclude_user_id=None):
        """Получаем все активные события из MongoDB, исключая события пользователя"""
        try:
            query = {"isActive": True}
            if exclude_user_id:
                query["creator._id"] = {"$ne": ObjectId(exclude_user_id)}
            
            events = list(self.db.events.find(query))
            return [e for e in events if e.get('creator') and isinstance(e['creator'], dict) and e['creator'].get('_id')]
        except Exception as e:
            print(f"Error fetching events: {str(e)}")
            return []
    
    def get_user_events_history(self, user_id):
        """Получаем историю событий пользователя"""
        user = self.get_user_data(user_id)
        return user.get('visitedEvents', [])
    
    def clean_text(self, text):
        """Очистка и нормализация текста"""
        if not text:
            return ""
        text = re.sub(r'[^a-zA-Z0-9а-яА-Я\s]', '', text)
        return text.lower().strip()
    
    def train_content_based_model(self):
        """Обучаем контент-базированную модель"""
        events = self.get_all_events()
        
        if not events:
            raise ValueError("No active events found in database")
        
        event_profiles = {}
        for event in events:
            try:
                creator_obj = event.get('creator', {})
                creator_id = str(creator_obj.get('_id')) if creator_obj and creator_obj.get('_id') else None
                if not creator_id:
                    continue
                
                tags = []
                if event.get('eventTags'):
                    if isinstance(event['eventTags'], str):
                        tags = [self.clean_text(tag) for tag in event['eventTags'].split(',')]
                    elif isinstance(event['eventTags'], list):
                        tags = [self.clean_text(tag) for tag in event['eventTags']]
                
                categories = []
                if event.get('category'):
                    if isinstance(event['category'], str):
                        categories = [self.clean_text(event['category'])]
                    elif isinstance(event['category'], list):
                        categories = [self.clean_text(cat) for cat in event['category']]
                
                name_features = [self.clean_text(event.get('name', ''))]
                
                event_features = tags + categories + name_features
                event_features = [f for f in event_features if f]
                
                if not event_features:
                    event_features = ['event', 'activity', 'meetup']
                
                event_profiles[str(event['_id'])] = {
                    'features': ' '.join(event_features),
                    'creator_id': creator_id
                }
            except Exception as e:
                print(f"Error processing event {event.get('_id')}: {str(e)}")
                continue
        
        if not event_profiles:
            raise ValueError("No valid events with creator information found")
        
        tfidf = TfidfVectorizer(stop_words='english', min_df=1)
        event_ids = list(event_profiles.keys())
        event_texts = [event_profiles[eid]['features'] for eid in event_ids]
        
        try:
            tfidf_matrix = tfidf.fit_transform(event_texts)
        except ValueError as e:
            print(f"Error in TF-IDF: {str(e)}")
            dummy_texts = ['event activity'] * len(event_texts)
            tfidf = TfidfVectorizer(stop_words='english')
            tfidf_matrix = tfidf.fit_transform(dummy_texts)
        
        self.model_data['event_profiles'] = event_profiles
        self.model_data['tfidf_vectorizer'] = tfidf
        self.model_data['tfidf_matrix'] = tfidf_matrix
        self.model_data['last_retraining'] = datetime.now()
        self.save_model()
        
        print(f"Model trained with {len(event_profiles)} valid events")
        return True
    
    def get_creator_ratings(self):
        """Получаем рейтинги создателей"""
        creators = defaultdict(list)
        events = self.get_all_events()
        all_ratings = []
        
        for event in events:
            try:
                creator_obj = event.get('creator', {})
                creator_id = str(creator_obj.get('_id')) if creator_obj and creator_obj.get('_id') else None
                if not creator_id:
                    continue
                
                rating = event.get('eventRating', 0)
                rating_count = event.get('ratingCount', 0)
                
                if rating_count > 0 and rating > 0:
                    creators[creator_id].append(rating)
                    all_ratings.append(rating)
            except Exception as e:
                continue
        
        overall_avg = sum(all_ratings) / len(all_ratings) if all_ratings else 3.0
        
        creator_avg_ratings = {}
        for creator_id, ratings in creators.items():
            creator_avg_ratings[creator_id] = sum(ratings) / len(ratings)
        
        return creator_avg_ratings, overall_avg
    
    def create_user_profile(self, user_id):
        """Создаем профиль пользователя"""
        user = self.get_user_data(user_id)
        visited_events = self.get_user_events_history(user_id)
        
        user_interests = []
        if user.get('interestedTags'):
            if isinstance(user['interestedTags'], list):
                user_interests = [self.clean_text(tag) for tag in user['interestedTags']]
            elif isinstance(user['interestedTags'], str):
                user_interests = [self.clean_text(tag) for tag in user['interestedTags'].split(',')]
        
        if not user_interests:
            user_interests = ['meetup', 'social', 'activity']
        
        user_profile = {
            'interested_tags': user_interests,
            'visited_events': [str(eid) for eid in visited_events],
            'created_at': datetime.now()
        }
        
        self.model_data['user_profiles'][str(user_id)] = user_profile
        self.save_model()
        return user_profile
    
    def get_recommendations(self, user_id, n=10):
        """Получаем рекомендации, исключая свои события"""
        try:
            user_id = str(user_id)
            current_user_obj_id = ObjectId(user_id)
            
            if ('tfidf_matrix' not in self.model_data or 
                self.model_data['tfidf_matrix'] is None or
                (hasattr(self.model_data['tfidf_matrix'], 'shape') and 
                 self.model_data['tfidf_matrix'].shape[0] == 0)):
                
                print("Model not trained or empty, training...")
                self.train_content_based_model()
            
            if user_id not in self.model_data['user_profiles']:
                self.create_user_profile(user_id)
            
            user_profile = self.model_data['user_profiles'][user_id]
            all_events = self.get_all_events(exclude_user_id=user_id)
            event_profiles = self.model_data['event_profiles']
            
            tfidf = self.model_data['tfidf_vectorizer']
            user_interests_text = ' '.join(user_profile['interested_tags'])
            user_vector = tfidf.transform([user_interests_text])
            
            cosine_sim = linear_kernel(user_vector, self.model_data['tfidf_matrix']).flatten()
            
            creator_ratings, overall_avg = self.get_creator_ratings()
            
            event_scores = []
            for idx, event in enumerate(all_events):
                try:
                    event_id = str(event['_id'])
                    
                    if event_id not in event_profiles or event_id in user_profile['visited_events']:
                        continue
                    
                    event_index = list(event_profiles.keys()).index(event_id)
                    content_score = cosine_sim[event_index]
                    
                    creator_id = event_profiles[event_id]['creator_id']
                    creator_rating = creator_ratings.get(creator_id, overall_avg)
                    
                    collab_score = creator_rating / 5.0
                    hybrid_score = 0.6 * content_score + 0.4 * collab_score
                    
                    event_scores.append({
                        'event_id': event_id,
                        'event_name': event.get('name', 'No name'),
                        'event_description': event.get('description', ''),
                        'event_category': event.get('category', ''),
                        'event_tags': event.get('eventTags', ''),
                        'creator_rating': creator_rating,
                        'content_score': float(content_score),
                        'collab_score': float(collab_score),
                        'hybrid_score': float(hybrid_score)
                    })
                except Exception as e:
                    print(f"Skipping event {event.get('_id')} due to error: {str(e)}")
                    continue
            
            event_scores.sort(key=lambda x: x['hybrid_score'], reverse=True)
            return [e for e in event_scores if e['hybrid_score'] > 0][:n]
        
        except Exception as e:
            print(f"Error in get_recommendations: {traceback.format_exc()}")
            return []
    
    def retrain_model(self):
        """Переобучение модели"""
        print("Starting model retraining...")
        try:
            self.train_content_based_model()
            print("Model retraining completed.")
            return {"status": "success", "message": "Model retrained successfully"}
        except Exception as e:
            print(f"Retraining failed: {str(e)}")
            return {"status": "error", "message": str(e)}