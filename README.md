# Reddit Desktop Assistant

A local Windows assistant for **one Reddit account**. It collects recent discussions from communities selected by the user, shows incoming replies and messages, prepares English drafts, and requires a separate review and approval for every post or reply. It never schedules or automatically submits content.

This source repository is an early, testable prototype for a Reddit API access request. Live Reddit authorization and posting require Reddit's approval and have not yet been verified with a real account.

## What it does

- Keeps a review queue for posts and replies. Every send requires a current preview of the exact text and an explicit confirmation. Editing invalidates that preview. It will not automatically retry an uncertain submission.
- Reads only up to five communities that the user chooses and reviews. If a community's rules change, publishing requires another review. A detected AI prohibition blocks publishing.
- Shows recent topics and the account's inbox. Replies can only target an item previously loaded in the app. Received private messages can be answered; unsolicited messages and Reddit Chat are not supported.
- Can optionally suggest drafts using a local Ollama model. All drafts remain editable. No model is required to use the queue manually.
- Uses a loopback server, local browser interface, one-use launch link, CSRF protection, and OAuth for an installed Reddit app. It asks for no Reddit password or client secret.

The rule detector cannot interpret every community policy or moderator decision. The user must read the complete current rules and check whether AI-assisted text is permitted before contributing. Do not use the app for spam, automated voting, false personal claims, or prohibited content.

## Run on Windows

1. Install [Node.js 22 or newer](https://nodejs.org/en/download) if it is not already installed.
2. Download this repository as a ZIP from GitHub, extract it, and double-click `start.cmd`. Alternatively run `node server.mjs --open` in this folder.
3. Keep the console window open. If the browser does not open, copy the private local launch link printed in that window into a browser **on the same computer**. The link works once per launch.
4. You can create and edit manual post drafts before connecting. Reddit reading and publishing require an approved API client.

The server listens only on `127.0.0.1:48765`. No npm install or cloud deployment is required.

### Optional local AI drafts

Install [Ollama](https://ollama.com/download), start it, and download a model (for example `ollama pull gemma3:4b`). Put the installed model name into the app. The app sends draft context and your current draft to the Ollama service at `127.0.0.1:11434`. It does **not** use your Codex subscription or OpenAI API credits. Whether the model runs comfortably depends on your PC's memory and hardware. You can always write drafts yourself.

## Reddit API setup after approval

Reddit API access must be approved by Reddit before this app connects. Create or register an **installed app** using the approved flow. Set its redirect URI to:

`http://127.0.0.1:48765/oauth/callback`

The current requested OAuth scopes are `identity`, `read`, `submit`, and `privatemessages`. Enter the installed app's client ID and your exact Reddit username in the interface, confirm approval, and complete authorization on Reddit's site. Do not put credentials, tokens, or a client secret in this repository.

The application uses the public repository link as its source-code link in the API request only once real source files have been uploaded to GitHub.

## Data and limitations

This prototype stores OAuth tokens, loaded Reddit content, community choices, and drafts **in memory only**. Closing or restarting the app clears them. It does not run in the background when the window is closed, send phone notifications, monitor communities continuously, or provide a packaged `.exe`. Reddit content is sent to the local Ollama service only when you ask for a draft. Reddit receives the OAuth requests and content that you explicitly approve for submission. No telemetry is built in.

Private messages supported by the current code are classic Reddit inbox messages, not Reddit Chat. A lost response to a post or comment may mean Reddit accepted it; the app marks that item as uncertain and disables another send from it. Check Reddit before making any manual decision.

## Development

Requires Node.js 22+. Run `node --test`. Tests use local mocks and do not log into Reddit or submit real content. Source is dependency-free JavaScript, HTML, and CSS. No license has been selected yet.
