import time
import database

def main() -> None:
    print("core starting...")
    
    # 你的业务逻辑写在这里，例如每 60 秒写一次心跳
    while True:
        db.r.set("core:last_start", time.strftime("%Y-%m-%d %H:%M:%S"))
        print("core heartbeat:", db.r.get("core:last_start"))
        time.sleep(60)


if __name__ == "__main__":
    db = database.Database()
    db.init()  # 初始化数据库连接和其他资源
    main()