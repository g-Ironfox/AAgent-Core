import os
import time
from pymongo import MongoClient
import redis

MONGO_USER = os.getenv("MONGO_ROOT_USERNAME", "root")
MONGO_PASSWORD = os.getenv("MONGO_ROOT_PASSWORD", "root")
MONGO_URI = f"mongodb://{MONGO_USER}:{MONGO_PASSWORD}@mongodb:27017/?authSource=admin"
REDIS_URL = f"redis://redis:6379"

class Database:
    def __init__(self):
        self.mongo = None
        self.db = None
        self.r = None

    def init(self) -> None:
        """
        初始化数据库连接和其他资源。
        """
        # 连接 MongoDB（带认证）
        self.mongo = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        self.mongo.admin.command("ping")
        self.db = self.mongo['aagent_core']
        print(f"mongo connected: {MONGO_URI}")

        # 连接 Redis
        self.r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        self.r.ping()
        print(f"redis connected: {REDIS_URL}")