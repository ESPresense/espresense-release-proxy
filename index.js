// We support the GET, POST, HEAD, and OPTIONS methods from any origin,
// and allow any header on requests. These headers must be present
// on all responses to all CORS preflight requests. In practice, this means
// all responses to OPTIONS requests.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
}

// The URL for the remote third party API you want to fetch from
// but does not implement CORS
const API_URL = "https://github.com/ESPresense/ESPresense"

// The endpoint you want the CORS reverse proxy to be on
const PROXY_ENDPOINT = "/releases/"


function manifestResponse(fname) {
    var name = fname.substring(0,fname.lastIndexOf('.'));
  return new Response(`{
    "name": "ESPresense - ${name}",
    "builds": [{
        "chipFamily": "ESP32",
        "improv": false,
        "parts": [{
            "path": "${name}.bin",
            "offset": 65536
        }]
    }]
}`, {
    headers: {
      "content-type": "text/json;charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    },
  })
}

async function handleRequest(request) {
  const path = new URL(request.url).pathname

  if (path.endsWith(".json")){
      return manifestResponse(path.substring(path.lastIndexOf('/') + 1))
  }
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
  ){
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
  }
  else {
    // Handle standard OPTIONS request.
    // If you want to allow other HTTP Methods, you can do that here.
    return new Response(null, {
      headers: {
        Allow: "GET, HEAD, POST, OPTIONS",
      },
    })
  }
}

addEventListener("fetch", event => {
  const request = event.request
  const url = new URL(request.url)
  if(url.pathname.startsWith(PROXY_ENDPOINT)) {
    if (request.method === "OPTIONS") {
      // Handle CORS preflight requests
      event.respondWith(handleOptions(request))
    }
    else if(
      request.method === "GET" ||
      request.method === "HEAD" ||
      request.method === "POST"
    ){
      // Handle requests to the API server
      event.respondWith(handleRequest(request))
    }
    else {
      event.respondWith(
        new Response(null, {
          status: 405,
          statusText: "Method Not Allowed",
        }),
      )
    }
  }
})