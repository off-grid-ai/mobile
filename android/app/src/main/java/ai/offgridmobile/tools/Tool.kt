package ai.offgridmobile.tools

/**
 * Contract for all LLM tool integrations.
 *
 * When the model response contains a tool_use block, [ToolDispatcher] routes
 * execution here by matching [name] to the tool's declared name. The model
 * should be prompted with [description] so it knows when to invoke the tool.
 */
interface Tool {
    /** Unique identifier used to route tool_use blocks from the LLM. */
    val name: String

    /** Human/model-readable description injected into the system prompt. */
    val description: String

    /**
     * Execute the tool with an optional [input] string (may be empty for tools that
     * take no arguments). Returns a JSON string that is injected back into the model
     * context as a tool_result.
     */
    suspend fun execute(input: String): String
}
