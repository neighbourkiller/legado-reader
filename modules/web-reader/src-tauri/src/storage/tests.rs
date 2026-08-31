use crate::storage::db::StorageDb;
use crate::storage::models::*;
use serde_json::json;

#[test]
fn test_schema_initialization_and_version() {
    let db = StorageDb::open_in_memory().expect("打开内存数据库失败");
    let conn = db.lock().unwrap();
    let version: i32 = conn
        .query_row("PRAGMA user_version;", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, crate::storage::schema::CURRENT_DB_VERSION);
}

#[test]
fn test_book_crud_and_derived_columns() {
    let db = StorageDb::open_in_memory().expect("打开内存数据库失败");

    let book_id = "test-book-1";
    let meta = json!({
        "id": book_id,
        "name": "测试书名",
        "author": "测试作者",
        "format": "txt",
        "totalChapters": 10,
        "currentChapter": 1,
        "currentProgress": 0.1,
        "lastReadTime": 1000,
        "customField": "customValue"
    });
    let chapters = json!([
        {"index": 0, "title": "第一章"},
        {"index": 1, "title": "第二章"}
    ]);
    let file_bytes = b"hello txt content";

    // 1. 保存书籍
    db.save_book(&meta, &chapters, Some(file_bytes)).unwrap();

    // 2. 读取记录与文件
    let record = db
        .get_book_record(book_id)
        .unwrap()
        .expect("找不到书籍记录");
    assert_eq!(record.meta["name"], "测试书名");
    assert_eq!(record.meta["customField"], "customValue");
    assert!(record.has_file_data);
    assert_eq!(record.file_size, file_bytes.len());

    let file = db.get_book_file(book_id).unwrap().expect("找不到书籍文件");
    assert_eq!(file, file_bytes);

    // 3. 更新 meta
    let updates = json!({
        "currentChapter": 2,
        "currentProgress": 0.2,
        "lastReadTime": 2000,
        "newField": 123
    });
    db.update_book_meta(book_id, &updates).unwrap();

    let updated_record = db.get_book_record(book_id).unwrap().unwrap();
    assert_eq!(updated_record.meta["currentChapter"], 2);
    assert_eq!(updated_record.meta["customField"], "customValue");
    assert_eq!(updated_record.meta["newField"], 123);
    assert_eq!(updated_record.meta["lastReadTime"], 2000);

    // 4. 插入书签与章节缓存
    db.save_bookmark(&BookmarkRecord {
        id: "b-1".to_string(),
        book_id: book_id.to_string(),
        book_name: "测试书名".to_string(),
        book_author: "测试作者".to_string(),
        chapter_index: 1,
        chapter_pos: 0,
        start_offset: 0,
        end_offset: 5,
        chapter_title: "第二章".to_string(),
        content: "摘录".to_string(),
        note: None,
        android_chapter_pos: None,
        created_at: 1000,
    })
    .unwrap();

    db.save_chapter_content(&StoredChapterContent {
        key: format!("{book_id}:0"),
        book_id: book_id.to_string(),
        chapter_index: 0,
        title: "第一章".to_string(),
        content: "第一章正文".to_string(),
        source_url: None,
        chapter_url: None,
        downloaded_at: 1000,
    })
    .unwrap();

    // 5. 删除书籍：联动清理章节缓存，但保留书签！
    db.delete_book(book_id).unwrap();

    assert!(db.get_book_record(book_id).unwrap().is_none());
    assert!(db.get_book_chapter_contents(book_id).unwrap().is_empty());
    let bookmarks = db.get_bookmarks_by_book_id(book_id).unwrap();
    assert_eq!(bookmarks.len(), 1, "删除书籍应保留书签");
}

#[test]
fn test_chapter_cache_summaries() {
    let db = StorageDb::open_in_memory().expect("打开内存数据库失败");

    let book_id = "book-summary-1";
    let meta = json!({
        "id": book_id,
        "name": "缓存统计测试书",
        "author": "统计作者",
        "format": "online",
    });
    db.save_book(&meta, &json!([]), None).unwrap();

    let c1 = StoredChapterContent {
        key: format!("{book_id}:0"),
        book_id: book_id.to_string(),
        chapter_index: 0,
        title: "第1章".to_string(),
        content: "内容1".to_string(),
        source_url: None,
        chapter_url: None,
        downloaded_at: 1000,
    };
    let c2 = StoredChapterContent {
        key: format!("{book_id}:1"),
        book_id: book_id.to_string(),
        chapter_index: 1,
        title: "第2章".to_string(),
        content: "内容2更多文字".to_string(),
        source_url: None,
        chapter_url: None,
        downloaded_at: 1001,
    };

    db.save_chapter_content(&c1).unwrap();
    db.save_chapter_content(&c2).unwrap();

    let summaries = db.get_chapter_cache_summaries().unwrap();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].book_id, book_id);
    assert_eq!(summaries[0].book_name, "缓存统计测试书");
    assert_eq!(summaries[0].chapter_count, 2);
    assert!(summaries[0].size > 0);
}

#[test]
fn test_chapter_images_are_replaced_atomically_and_cleared_with_book_cache() {
    let db = StorageDb::open_in_memory().expect("打开内存数据库失败");
    let make_image = |index: i64, bytes: &[u8]| ChapterImageCacheRecord {
        book_id: "image-book".to_string(),
        chapter_index: 3,
        image_index: index,
        source_url: format!("https://example.com/{index}.jpg"),
        mime: "image/jpeg".to_string(),
        content_hash: format!("hash-{index}"),
        data: bytes.to_vec(),
    };
    db.replace_chapter_images(&[make_image(0, &[1, 2]), make_image(1, &[3, 4])])
        .unwrap();
    let first = db.get_chapter_images("image-book", 3).unwrap();
    assert_eq!(first.len(), 2);
    assert_eq!(first[1].data, vec![3, 4]);

    let duplicate = vec![make_image(0, &[7]), make_image(0, &[8])];
    assert!(db.replace_chapter_images(&duplicate).is_err());
    let after_rollback = db.get_chapter_images("image-book", 3).unwrap();
    assert_eq!(after_rollback.len(), 2, "部分写入失败必须回滚整章图片");
    assert_eq!(after_rollback[0].data, vec![1, 2]);

    db.replace_chapter_images(&[make_image(0, &[9])]).unwrap();
    assert_eq!(db.get_chapter_images("image-book", 3).unwrap().len(), 1);
    db.delete_book_chapter_contents("image-book").unwrap();
    assert!(db.get_chapter_images("image-book", 3).unwrap().is_empty());
}

#[test]
fn test_reading_records_device_contributions() {
    let db = StorageDb::open_in_memory().expect("打开内存数据库失败");

    let book_id = "reading-book-1";
    // 设备 A 阅读 60 秒
    db.add_reading_time(book_id, "阅读测试书", "作者", 60, 1000, "dev-A")
        .unwrap();
    // 设备 B 阅读 40 秒
    db.add_reading_time(book_id, "阅读测试书", "作者", 40, 2000, "dev-B")
        .unwrap();

    let records = db.get_all_reading_records().unwrap();
    assert_eq!(records.len(), 1);
    let rec = &records[0];
    assert_eq!(rec.read_time, 100);
    assert_eq!(rec.last_read, 2000);
    assert_eq!(rec.devices.get("dev-A").unwrap().read_time, 60);
    assert_eq!(rec.devices.get("dev-B").unwrap().read_time, 40);
}

#[test]
fn test_add_reading_time_args_camel_case_deserialization() {
    use crate::storage::commands::AddReadingTimeArgs;
    let json_data = json!({
        "bookId": "book-123",
        "bookName": "我的书",
        "bookAuthor": "作家",
        "duration": 120,
        "timestamp": 1600000000,
        "deviceId": "tauri-device-x"
    });
    let args: AddReadingTimeArgs = serde_json::from_value(json_data).expect("反序列化失败");
    assert_eq!(args.book_id, "book-123");
    assert_eq!(args.book_name, "我的书");
    assert_eq!(args.book_author, "作家");
    assert_eq!(args.duration, 120);
    assert_eq!(args.timestamp, 1600000000);
    assert_eq!(args.device_id, "tauri-device-x");
}

#[test]
fn test_preferences_crud_and_delete() {
    let db = StorageDb::open_in_memory().expect("打开内存数据库失败");

    db.save_preference("test_key", "val1").unwrap();
    assert_eq!(
        db.get_preference("test_key").unwrap(),
        Some("val1".to_string())
    );

    db.delete_preference("test_key").unwrap();
    assert_eq!(db.get_preference("test_key").unwrap(), None);
}
