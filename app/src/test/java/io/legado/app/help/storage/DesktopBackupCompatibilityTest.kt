package io.legado.app.help.storage

import io.legado.app.data.entities.Book
import io.legado.app.data.entities.BookSource
import io.legado.app.data.entities.Bookmark
import io.legado.app.data.entities.BookHighlight
import io.legado.app.data.entities.ReadRecord
import io.legado.app.data.entities.ReplaceRule
import io.legado.app.utils.GSON
import io.legado.app.utils.fromJsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

class DesktopBackupCompatibilityTest {

    private val fixtureDirectory: File by lazy {
        generateSequence(File(System.getProperty("user.dir") ?: ".")) { it.parentFile }
            .map { File(it, "modules/web-reader/test-fixtures/android-compatible") }
            .firstOrNull(File::isDirectory)
            ?: error("找不到桌面备份兼容夹具")
    }

    @Test
    fun androidGsonParsesAllDesktopStandardFilesAndIgnoresTauriExtension() {
        val zipBytes = ByteArrayOutputStream().use { output ->
            ZipOutputStream(output).use { zip ->
                listOf(
                    "bookSource.json",
                    "bookshelf.json",
                    "bookmark.json",
                    "readRecord.json",
                    "highlight.json",
                    "replaceRule.json",
                )
                    .forEach { name ->
                        zip.putNextEntry(ZipEntry(name))
                        zip.write(File(fixtureDirectory, name).readBytes())
                        zip.closeEntry()
                    }
                zip.putNextEntry(ZipEntry("tauri/manifest.json"))
                zip.write("""{"format":"legado-tauri-backup","version":1}""".toByteArray())
                zip.closeEntry()
                zip.putNextEntry(ZipEntry("tauri/data.json"))
                zip.write("""{"version":1,"database":{}}""".toByteArray())
                zip.closeEntry()
            }
            output.toByteArray()
        }

        val entries = linkedMapOf<String, String>()
        ZipInputStream(ByteArrayInputStream(zipBytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (!entry.isDirectory) entries[entry.name] = zip.readBytes().toString(Charsets.UTF_8)
            }
        }

        val sources = GSON.fromJsonArray<BookSource>(entries.getValue("bookSource.json")).getOrThrow()
        val books = GSON.fromJsonArray<Book>(entries.getValue("bookshelf.json")).getOrThrow()
        val bookmarks = GSON.fromJsonArray<Bookmark>(entries.getValue("bookmark.json")).getOrThrow()
        val records = GSON.fromJsonArray<ReadRecord>(entries.getValue("readRecord.json")).getOrThrow()
        val highlights = GSON.fromJsonArray<BookHighlight>(entries.getValue("highlight.json")).getOrThrow()
        val replaceRules = GSON.fromJsonArray<ReplaceRule>(entries.getValue("replaceRule.json")).getOrThrow()

        assertEquals("https://source.example.com", sources.single().bookSourceUrl)
        assertEquals("https://book.example.com/fixture", books.single().bookUrl)
        assertEquals(2, books.single().durChapterIndex)
        assertEquals("这是跨端书签摘录", bookmarks.single().bookText)
        assertEquals("tauri-fixture-device", records.single().deviceId)
        assertEquals("WAVY", highlights.single().styleObj().underline?.kind?.name)
        assertEquals("Tauri 兼容替换规则", replaceRules.single().name)
        assertEquals(1, replaceRules.single().order)
        assertTrue(entries.keys.containsAll(listOf("tauri/manifest.json", "tauri/data.json")))
    }
}
