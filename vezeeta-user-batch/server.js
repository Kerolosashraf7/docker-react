const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const API_URL = 'https://service.stg.subvezeeta.com/users/api/users';
const DEFAULT_ROLE = 31;
const PASSWORD_POLICY = '16 chars with upper, lower, number, and symbol';
const publicDir = path.join(__dirname, 'public');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function serveStaticFile(requestPath, response) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const resolvedPath = path.normalize(path.join(publicDir, safePath));

  if (!resolvedPath.startsWith(publicDir)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(resolvedPath, (error, fileBuffer) => {
    if (error) {
      sendJson(response, 404, { error: 'File not found' });
      return;
    }

    const extension = path.extname(resolvedPath);
    response.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
    response.end(fileBuffer);
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    request.on('data', (chunk) => {
      rawBody += chunk;
    });

    request.on('end', () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });
}

function buildPayload(user) {
  return {
    Username: user.mail,
    Password: user.password,
    userclaims: [
      {
        claimname: 'ownerkey',
        ClaimValue: user.key,
        ClaimTypeId: 1
      }
    ],
    Role: DEFAULT_ROLE,
    roles: [DEFAULT_ROLE],
    fullname: user.name
  };
}

function proxyCreateUser(user) {
  const body = JSON.stringify(buildPayload(user));

  return new Promise((resolve, reject) => {
    const request = https.request(
      API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (apiResponse) => {
        let responseBody = '';

        apiResponse.on('data', (chunk) => {
          responseBody += chunk;
        });

        apiResponse.on('end', () => {
          const contentType = apiResponse.headers['content-type'] || '';
          let parsedBody = responseBody;

          if (contentType.includes('application/json') && responseBody) {
            try {
              parsedBody = JSON.parse(responseBody);
            } catch (error) {
              parsedBody = responseBody;
            }
          }

          resolve({
            ok: apiResponse.statusCode >= 200 && apiResponse.statusCode < 300,
            status: apiResponse.statusCode,
            body: parsedBody,
            generatedPassword: user.password
          });
        });
      }
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'GET' && url.pathname === '/api/config') {
    sendJson(response, 200, {
      endpoint: API_URL,
      defaultRole: DEFAULT_ROLE,
      passwordPolicy: PASSWORD_POLICY
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/users') {
    try {
      const user = await readRequestBody(request);

      if (!user.mail || !user.key || !user.name || !user.password) {
        sendJson(response, 400, { error: 'mail, key, name, and password are required' });
        return;
      }

      const apiResult = await proxyCreateUser(user);
      sendJson(response, apiResult.status, apiResult);
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Unexpected server error' });
    }
    return;
  }

  if (request.method === 'GET') {
    serveStaticFile(url.pathname, response);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`Vezeeta user batch app running on http://localhost:${PORT}`);
});
