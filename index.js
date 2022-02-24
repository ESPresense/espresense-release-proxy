// We support the GET, POST, HEAD, and OPTIONS methods from any origin,
// and allow any header on requests. These headers must be present
// on all responses to all CORS preflight requests. In practice, this means
// all responses to OPTIONS requests.
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
}

// The endpoint you want the CORS reverse proxy to be on
const PROXY_ENDPOINT = "/releases/"
const DOWNLOAD_ENDPOINT = "/releases/latest-any/download/"

function manifestResponse(request) {
    const path = new URL(request.url).pathname;
    const fname = path.substring(path.lastIndexOf('/') + 1);
    const name = fname.substring(0, fname.lastIndexOf('.'));
    return new Response(`{
    "name": "ESPresense (${name})",
    "new_install_prompt_erase": true,

    "builds": [{
        "chipFamily": "ESP32",
        "improv": false,
        "parts": [{
            "path": "/static/bootloader_esp32.bin",
            "offset": 4096
        },
        {
            "path": "/static/partitions.bin",
            "offset": 32768
        },
        {
            "path": "/static/boot_app0.bin",
            "offset": 57344
        },
        {
            "path": "${name}.bin",
            "offset": 65536
        }
        ]
    }]
}`, {
        headers: {
            "content-type": "text/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
        },
    })
}

async function fetchFromGithub(request) {
    const API_URL = "https://github.com/ESPresense/ESPresense"
    const path = new URL(request.url).pathname
    const url = API_URL + path
    request = new Request(url)
    request.followAllRedirects = true
    console.log(`Request: ${request.url}`)

    request.headers.set("Origin", new URL(request.url).pathname)
    let response = await fetch(request)

    // Recreate the response so we can modify the headers
    response = new Response(response.body, response)

    // Set CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*")

    return response
}

function handleOptions(request) {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    let headers = request.headers;
    if (
        headers.get("Origin") !== null &&
        headers.get("Access-Control-Request-Method") !== null &&
        headers.get("Access-Control-Request-Headers") !== null
    ) {
        // Handle CORS pre-flight request.
        // If you want to check or reject the requested method + headers
        // you can do that here.
        let respHeaders = {
            ...corsHeaders,
            // Allow all future content Request headers to go back to browser
            // such as Authorization (Bearer) or X-Client-Name-Version
            "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers"),
        }

        return new Response(null, {
            headers: respHeaders,
        })
    } else {
        // Handle standard OPTIONS request.
        // If you want to allow other HTTP Methods, you can do that here.
        return new Response(null, {
            headers: {
                Allow: "GET, HEAD, POST, OPTIONS",
            },
        })
    }
}

async function redirectToPrerelease(request) {
    const path = new URL(request.url).pathname;
    const fname = path.substring(path.lastIndexOf('/') + 1);

    request = new Request("https://api.github.com/repos/ESPresense/ESPresense/releases")
    request.headers.set("User-Agent", "espresense-release-proxy")
    request.followAllRedirects = true
    console.log(`Request: ${request.url}`)
    let response = await fetch(request)
    const rels = JSON.parse(await response.text());
    const rel = rels.find(a => a.assets.length);
    if (!rel) new Response(null, { status: 404, statusText: "No release found!" });
    const asset = rel.assets.find(a => a.name == fname);
    if (!asset) new Response(null, { status: 404, statusText: "No asset found!" });
    return Response.redirect(asset.browser_download_url)
}

addEventListener("fetch", event => {
    const request = event.request
    const url = new URL(request.url)
    const path = new URL(request.url).pathname

    if (path.startsWith(PROXY_ENDPOINT)) {
        if (request.method === "OPTIONS") {
            // Handle CORS preflight requests
            event.respondWith(handleOptions(request))
        } else if (
            request.method === "GET" ||
            request.method === "HEAD" ||
            request.method === "POST"
        ) {
            if (path.endsWith(".json"))
                event.respondWith(manifestResponse(request))
            else if (path.endsWith(".bin")) {
                if (path.startsWith(DOWNLOAD_ENDPOINT))
                    event.respondWith(redirectToPrerelease(request))
                else
                    event.respondWith(fetchFromGithub(request))
            }
        } else {
            event.respondWith(
                new Response(null, {
                    status: 405,
                    statusText: "Method Not Allowed",
                }),
            )
        }
    }
})