# Mobile App Synchronization Rule

Whenever you are asked to modify an API endpoint, change a data model, or introduce a breaking change in this backend repository (`casaos-reborn`), you MUST remember that there is an active React Native mobile application relying on these APIs.

The mobile application repository is located at:
`c:\Users\loren\Documents\GitHub\casaos-reborn-mobile`

**Instructions for the Agent:**
1. Before committing to a breaking API change (e.g., changing response JSON structure, renaming endpoints, altering authentication), use your `grep_search` and `view_file` tools to search the mobile repository (`casaos-reborn-mobile`).
2. Verify if and how the mobile app consumes the endpoint you are about to modify.
3. If a change is required, ensure you propose updates for BOTH the backend and the mobile app to prevent breaking the mobile client.
4. Always prioritize backward compatibility when possible.
