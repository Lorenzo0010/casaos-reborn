# Mobile App Synchronization Rule

Whenever you are asked to modify an API endpoint, change a data model, or introduce a breaking change in this backend repository (`casaos-reborn`), you MUST remember that there is an active React Native mobile application relying on these APIs.

The mobile application repository is located at:
`c:\Users\loren\Documents\GitHub\casaos-reborn-mobile`

**Instructions for the Agent:**
1. Before committing to a breaking API change (e.g., changing response JSON structure, renaming endpoints, altering authentication), use your `grep_search` and `view_file` tools to search the mobile repository (`casaos-reborn-mobile`).
2. Verify if and how the mobile app consumes the endpoint you are about to modify.
3. If a change is required, ensure you propose updates for BOTH the backend and the mobile app to prevent breaking the mobile client.
4. Always prioritize backward compatibility when possible.

# Context and Project Focus Rule

By default, ALL modifications, file creations, and searches must be performed strictly within the currently active/open project directory.

**Instructions for the Agent:**
1. If the user asks for a modification without explicitly mentioning a different project, you MUST restrict your actions entirely to the currently open project.
2. Only exit the current project's scope if the user explicitly specifies another project by name or path in their request.

# English Language Rule

All additions to the codebase (including new UI strings, comments, variable names, and documentation) MUST be written in English.

**Instructions for the Agent:**
1. When adding new features, modals, alerts, or any user-facing text, use English by default.
2. If modifying an existing file that contains non-English text, preserve the existing text unless instructed otherwise, but ensure your new additions are in English.
3. If requested to translate existing text, convert it to English to maintain consistency.
