package io.legado.app.model.analyzeRule

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import io.legado.app.data.entities.BookSource
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.security.MessageDigest

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

    private data class CandidateInput(val content: String, val rule: String)

    private data class CandidateFixture(
        val kind: String,
        val execution: String,
        val input: CandidateInput,
    )

    private data class CandidateActual(
        val runtime: String,
        val status: String,
        val fixtureHash: String,
        val actual: List<String>,
        val code: String? = null,
    )

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray())
        .joinToString("") { "%02x".format(it) }

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

    @Test
    fun candidateFixtureProducesActualResult() {
        val fixturePath = System.getenv("LEGADO_SOURCE_CANDIDATE_FIXTURE")
        val outputPath = System.getenv("LEGADO_SOURCE_CANDIDATE_OUTPUT")
        assumeTrue(!fixturePath.isNullOrBlank() && !outputPath.isNullOrBlank())
        val gson = Gson()
        val fixture = gson.fromJson(File(fixturePath!!).readText(), CandidateFixture::class.java)
        assertEquals("source-audit-rule-differential-fixture", fixture.kind)
        val fixtureHash = sha256("${fixture.input.content}\u0000${fixture.input.rule}")
        val result = try {
            val actual = if (fixture.execution == "elements") {
                AnalyzeRule().setContent(fixture.input.content).getElements(fixture.input.rule).map { element ->
                    AnalyzeRule().setContent(element).getString("text")
                }
            } else {
                val list = AnalyzeRule().setContent(fixture.input.content).getStringList(fixture.input.rule)
                if (list.isNullOrEmpty()) emptyList() else listOf(list.joinToString("\n"))
            }
            CandidateActual("android", "completed", fixtureHash, actual)
        } catch (error: Throwable) {
            CandidateActual("android", "failed", fixtureHash, emptyList(), error.javaClass.simpleName)
        }
        File(outputPath!!).apply {
            parentFile?.mkdirs()
            writeText(gson.toJson(result))
        }
    }
}
