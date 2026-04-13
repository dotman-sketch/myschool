# Life Fountain College Website

This project is a simple static website enhanced with a Node.js/Express backend for
administration and data storage. The server enables:

- passcode login without exposing secrets in the client
- persistence of admission applications in `data/applications.json`
- editing of any HTML page through the `Admin` dashboard

## Getting started

1. **Install dependencies**:
   ```bash
   cd c:\Users\USER\Desktop\Myschool
   npm install
   ```

2. **Create environment file (optional)**
   ```text
   ADMIN_CODES=admin123,pass2026
   PORT=3000
   ```
   Place the above in a file named `.env` in the project root. If not specified,
   default codes and port will be used.

3. **Start the server**:
   ```bash
   npm run start   # or npm run dev if you have nodemon installed globally
   ```

4. **Open the site** in your browser at `http://localhost:3000`.

## Admin portal

- Use one of the passcodes from `ADMIN_CODES` to log in.
- After login you can view and download admissions or edit any of the HTML pages.
- Changes are saved on the server in the `edits/` directory and will be served to visitors.

## Notes

- This setup is purely for demonstration. For production use, add proper authentication,
  validation, and storage (e.g. a database).
- Do not store sensitive data in environment variables if the host is untrusted.

