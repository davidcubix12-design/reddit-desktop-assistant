# Reddit Desktop Assistant

A local Windows assistant for **one Reddit account**. It collects recent discussions from communities selected by the user, shows incoming replies and messages, prepares English drafts, and requires a separate review and approval for every post or reply. It never schedules or automatically submits content.

This source repository is an early, testable prototype for a Reddit API access request. Live Reddit authorization and posting require Reddit's approval and have not yet been verified with a real account.

## What it does

- Keeps a review queue for posts and replies. Every send requires a current preview of the exact text and an explicit confirmation. Editing invalidates that preview. It will not automatically retry an uncertain submission.
- Reads only up to five communities that the user chooses and reviews. If a community's rules change, publishing requires another review. A detected AI prohibition blocks publishing.
- Shows recent topics and the account's inbox. Replies can only target an item previously loaded in the app. Received private messages can be answered; unsolicited messages and Reddit Chat are not supported.
- After Reddit access is approved and you confirm the rules of at least one community, it can check those communities about every 20 minutes. It considers recent text posts and comments, then prepares at most two reply drafts per scan, with a maximum of six unfinished automatic drafts. You can pause the scan or trigger one immediately. Every draft still needs your review and separate approval before sending.
- In the same scan, it can also use recent titles from an approved community to propose one original English media link post. Local Ollama chooses a search query and photo or video, searches Wikimedia Commons, then chooses a specific licensed result from its metadata. At most two unfinished automatic media drafts are kept. The app has no visual understanding of the selected file, so check its preview and source before approving. It never auto-publishes.
- Can optionally suggest drafts using a local Ollama model. All drafts remain editable. No model is required to use the queue manually.
- Searches Wikimedia Commons for photos and videos without an account or API key, with a preview, creator, original file page, and license link. You can choose one result to make a **link-post** draft pointing to its Commons page. This is not a native Reddit image/video upload, and Reddit may display a link rather than embedded media. Media links still require subreddit rule review and individual send approval.
- Uses a loopback server, local browser interface, one-use launch link, CSRF protection, and OAuth for an installed Reddit app. It asks for no Reddit password or client secret.

The rule detector cannot interpret every community policy or moderator decision. The user must read the complete current rules and check whether AI-assisted text is permitted before contributing. Do not use the app for spam, automated voting, false personal claims, or prohibited content.

## Run on Windows

1. For the prepared Windows installation, double-click the **Reddit Desktop Assistant** shortcut. It starts the app without showing a command window and opens the browser interface.
2. A fresh source download from GitHub does not contain the portable Node.js runtime. Install [Node.js 22 or newer](https://nodejs.org/en/download) once, then double-click `launch.vbs` in the extracted folder. `start.cmd` is available for troubleshooting and displays startup errors.
3. You can create and edit manual post drafts before connecting. Reddit reading and publishing require an approved API client.
4. To search media, enter a topic in the Wikimedia Commons section, choose photo or video, then select a result and add a title. Check that file's author and license as well as the chosen community's rules. No separate account or API key is needed for search.

The server listens only on `127.0.0.1:48765`. No npm install or cloud deployment is required. The browser interface works only while its local server process is running. The background scan also runs only while that process is running. Closing the process clears the in-memory session and drafts.

### Optional local AI drafts

Install [Ollama](https://ollama.com/download), start it, and download a model. The prepared local installation uses `gemma3:12b`; a fresh source checkout needs that model downloaded separately. Put the installed model name into the app. The app sends draft context and your current draft to the Ollama service at `127.0.0.1:11434`. It does **not** use your Codex subscription or OpenAI API credits. Whether the model runs comfortably depends on your PC's memory and hardware. You can always write drafts yourself.

## Reddit API setup after approval

Reddit API access must be approved by Reddit before this app connects. Create or register an **installed app** using the approved flow. Set its redirect URI to:

`http://127.0.0.1:48765/oauth/callback`

The current requested OAuth scopes are `identity`, `read`, `submit`, and `privatemessages`. Enter the installed app's client ID and your exact Reddit username in the interface, confirm approval, and complete authorization on Reddit's site. Do not put credentials, tokens, or a client secret in this repository.

The application uses the public repository link as its source-code link in the API request only once real source files have been uploaded to GitHub.

## Data and limitations

This prototype stores OAuth tokens, loaded Reddit content, community choices, and drafts **in memory only**. Closing or restarting the server clears them. It does not send phone notifications or provide a packaged `.exe`. Once connected and enabled, its limited scan continues while the local server process is running, even if the browser tab is closed. It sends selected post or comment context to the local Ollama service when preparing an automatic draft or when you request one manually. It never trains the model on Reddit content. Reddit receives the OAuth requests and content that you explicitly approve for submission. No telemetry is built in.

Private messages supported by the current code are classic Reddit inbox messages, not Reddit Chat. A lost response to a post or comment may mean Reddit accepted it; the app marks that item as uncertain and disables another send from it. Check Reddit before making any manual decision.

Wikimedia Commons search and preview work before Reddit approval. Live photo and video search were checked without credentials. Live Reddit media-link submission has not been verified with the user's account. Native Reddit media uploads are not implemented. A link post cannot include a text body, so media drafts contain a title and the Commons file page URL only.

## Development

Requires Node.js 22+. Run `node --test`. Tests use local mocks and do not log into Reddit or submit real content. Source is dependency-free JavaScript, HTML, and CSS. No license has been selected yet.
