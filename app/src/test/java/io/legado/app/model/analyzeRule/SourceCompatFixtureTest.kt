package io.legado.app.model.analyzeRule

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import io.legado.app.data.entities.BookSource
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class SourceCompatFixtureTest {

    private data class Fixture(
        val id: String,
        val html: String,
        val rule: String,
        val androidExpected: List<String>,
        val mode: String? = null
    )

    private data class QuickJsFixture(
        val id: String,
        val code: String,
        val bindings: Map<String, Any?>,
        val androidExpected: List<String>,
        val androidUnitTest: Boolean = true,
    )

    @Test
    fun sharedXPathFixturesMatchAndroidAnalyzeRule() {
        val candidates = listOf(
            File(System.getProperty("user.dir"), "testdata/source-compat/rule-fixtures.json"),
            File(System.getProperty("user.dir"), "../testdata/source-compat/rule-fixtures.json"),
        )
        val fixtureFile = candidates.firstOrNull(File::isFile)
            ?: error("找不到共享 source-compat 夹具: ${candidates.joinToString()}")
        val type = object : TypeToken<List<Fixture>>() {}.type
        val fixtures: List<Fixture> = Gson().fromJson(fixtureFile.readText(), type)

        fixtures.forEach { fixture ->
            val actual = if (fixture.mode == "string") {
                val list = AnalyzeRule().setContent(fixture.html).getStringList(fixture.rule)
                if (list.isNullOrEmpty()) emptyList() else listOf(list.joinToString("\n"))
            } else {
                val elements = AnalyzeRule().setContent(fixture.html).getElements(fixture.rule)
                elements.map { element ->
                    AnalyzeRule().setContent(element).getString("text")
                }
            }
            assertEquals(fixture.id, fixture.androidExpected, actual)
        }
    }

    @Test
    fun sharedQuickJsHostFixturesMatchAndroidRhino() {
        val candidates = listOf(
            File(System.getProperty("user.dir"), "testdata/source-compat/quickjs-host-fixtures.json"),
            File(System.getProperty("user.dir"), "../testdata/source-compat/quickjs-host-fixtures.json"),
        )
        val fixtureFile = candidates.firstOrNull(File::isFile)
            ?: error("找不到共享 QuickJS/Rhino 宿主夹具: ${candidates.joinToString()}")
        val type = object : TypeToken<List<QuickJsFixture>>() {}.type
        val fixtures: List<QuickJsFixture> = Gson().fromJson(fixtureFile.readText(), type)

        fixtures.filter(QuickJsFixture::androidUnitTest).forEach { fixture ->
            val source = BookSource(
                bookSourceUrl = "https://fixture.invalid/${fixture.id}",
                bookSourceName = fixture.id,
            )
            val actual = AnalyzeRule(source = source)
                .evalJS(fixture.code, fixture.bindings["result"])
                ?.toString()
                ?.let(::listOf)
                .orEmpty()
            assertEquals(fixture.id, fixture.androidExpected, actual)
        }
    }
}
