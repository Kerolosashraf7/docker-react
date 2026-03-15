# Vezeeta User Batch Creator

Standalone Node project that serves one page and proxies uploaded CSV records to the Vezeeta add-user API.

The page starts empty. Users upload a CSV file with `mail,key,name`, review the rows, then trigger account creation. A complex password is generated on the server for each successful account creation request.

## Run

```bash
cd vezeeta-user-batch
npm start
```

The app runs on `http://localhost:3001` by default.
