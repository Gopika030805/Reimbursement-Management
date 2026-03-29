import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import cors from "cors";
import { google } from "googleapis";
import fs from "fs/promises";

const OCRSPACE_API_KEY = process.env.OCRSPACE_API_KEY || "K88920221588957";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTokenToIso(token: string): string | null {
  const cleaned = token.replace(/,/g, '').trim();
  const ymd = cleaned.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) return toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const dmyOrMdy = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmyOrMdy) {
    const first = Number(dmyOrMdy[1]);
    const second = Number(dmyOrMdy[2]);
    let year = Number(dmyOrMdy[3]);
    if (year < 100) {
      year = year < 70 ? 2000 + year : 1900 + year;
    }

    let month = first;
    let day = second;

    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      month = first;
      day = second;
    }

    return toIsoDate(year, month, day);
  }

  const mf = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{2,4})$/);
  if (mf) {
    const month = MONTHS[mf[1].toLowerCase()];
    if (!month) return null;
    let year = Number(mf[3]);
    if (year < 100) year = year < 70 ? 2000 + year : 1900 + year;
    return toIsoDate(year, month, Number(mf[2]));
  }

  const df = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (df) {
    const month = MONTHS[df[2].toLowerCase()];
    if (!month) return null;
    let year = Number(df[3]);
    if (year < 100) year = year < 70 ? 2000 + year : 1900 + year;
    return toIsoDate(year, month, Number(df[1]));
  }

  return null;
}

function extractReceiptDate(parsedText: string): string {
  const lines = parsedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const tokenRegexes = [
    /\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b/g,
    /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b/gi,
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}\b/gi,
  ];
  const today = new Date();
  const maxFuture = new Date(today);
  maxFuture.setDate(maxFuture.getDate() + 1);
  const seen = new Set<string>();
  const candidates: { iso: string; score: number; ts: number }[] = [];

  for (const line of lines) {
    const boost = /\b(date|invoice\s*date|transaction|txn|purchase|purchased|issued)\b/i.test(line) ? 5 : 0;
    const penalty = /\b(due|expiry|expires|exp)\b/i.test(line) ? -2 : 0;
    const base = boost + penalty;
    for (const regex of tokenRegexes) {
      const tokens = line.match(regex) || [];
      for (const token of tokens) {
        const iso = parseTokenToIso(token);
        if (!iso || seen.has(`${line}:${iso}`)) continue;
        const parsed = new Date(`${iso}T00:00:00`);
        if (parsed > maxFuture) continue;
        seen.add(`${line}:${iso}`);
        candidates.push({ iso, score: base, ts: parsed.getTime() });
      }
    }
  }

  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.score !== a.score ? b.score - a.score : b.ts - a.ts);
  return candidates[0].iso;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- MySQL Database Connection ---
const pool = mysql.createPool({
  host: 'localhost',
  user: 'user',
  password: 'root',
  database: 'odoo_reimbursement',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper to map DB row to CamelCase for Frontend
function mapUser(u: any) {
  if (!u) return u;
  return {
    ...u,
    companyId: u.company_id,
    managerId: u.manager_id,
    directorId: u.director_id,
    password: u.password,
  };
}

function mapExpense(e: any) {
  if (!e) return e;
  const dateStr = e.date instanceof Date ? e.date.toISOString().split('T')[0] : e.date;
  return {
    ...e,
    date: dateStr,
    employeeId: e.employee_id,
    baseAmount: e.base_amount,
    receiptUrl: e.receipt_url,
    currentStep: e.current_step,
  };
}

async function sendEmailViaGmail(to: string, subject: string, body: string) {
  try {
    const creds = JSON.parse(await fs.readFile("token.json", "utf-8"));
    
    const credentials = {
      access_token: creds.token || creds.access_token,
      refresh_token: creds.refresh_token,
      scope: creds.scopes ? creds.scopes.join(" ") : "",
      token_type: "Bearer",
      expiry_date: creds.expiry_date || (creds.expiry ? new Date(creds.expiry).getTime() : Date.now())
    };

    const oAuth2Client = new google.auth.OAuth2(
      creds.client_id,
      creds.client_secret
    );
    oAuth2Client.setCredentials(credentials);

    // Force token refresh if needed
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        // Update local memory if needed
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    
    // Professional HTML email template
    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #334155; border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden;">
        <div style="background-color: #4f46e5; padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">ExpenseFlow</h1>
          <p style="color: #c7d2fe; margin-top: 8px;">Smart Expense Management</p>
        </div>
        <div style="padding: 40px;">
          ${body}
          <div style="margin-top: 40px; padding-top: 24px; border-t: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center;">
            &copy; 2026 ExpenseFlow. All rights reserved.
          </div>
        </div>
      </div>
    `;

    const raw = Buffer.from(
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: text/html; charset=utf-8\r\n\r\n` +
      `${htmlBody}`
    ).toString("base64").replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    console.log(`Email sent successfully to ${to}`);
  } catch (error: any) {
    console.error("GMAIL API ERROR:", error.message || error);
    throw error; // Propagate the error so the API can handle it
  }
}

function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let pass = "";
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function mapCompany(c: any) {
  if (!c) return c;
  return {
    ...c,
    defaultCurrency: c.default_currency,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use((req, res, next) => {
    if (req.path === '/api/ocr') {
      console.log(`Incoming OCR Request: Content-Length: ${req.headers['content-length']} bytes`);
    }
    next();
  });
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Global Error Handler for Body Parser
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.type === 'entity.too.large') {
      console.error(`ERROR: Payload too large for ${req.path}. Limit is set to 100mb, but the request exceeded it.`);
      res.status(413).json({ error: "Payload Too Large: The file you're trying to scan is too big for the server to process." });
      return;
    }
    next(err);
  });

  // --- API Routes ---

  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    console.log("Login attempt:", { email, password });
    try {
      const [users] = await pool.execute("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]) as any[];
      const user = users[0];
      if (user) {
        res.json(mapUser(user));
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/signup", async (req, res) => {
    const { companyName, country, defaultCurrency, adminName, adminEmail } = req.body;
    const companyId = `comp-${Date.now()}`;
    const adminId = `u-${Date.now()}`;

    try {
      await pool.execute(
        "INSERT INTO companies (id, name, default_currency, country) VALUES (?, ?, ?, ?)",
        [companyId, companyName, defaultCurrency, country]
      );

      const password = generatePassword();
      await pool.execute(
        "INSERT INTO users (id, name, email, role, company_id, department, password) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [adminId, adminName, adminEmail, "Admin", companyId, "Administration", password]
      );

      // Send email to admin in background - DO NOT AWAIT to avoid UI blocking
      sendEmailViaGmail(
        adminEmail,
        "Welcome to ExpenseFlow - Your Organization is Ready!",
        `<h3>Hello ${adminName},</h3>
        <p>Your organization <b>${companyName}</b> has been successfully initialized on ExpenseFlow.</p>
        <p>You can now manage reimbursements, set approval rules, and onboard your team.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #f1f5f9;">
        <p><b>Login Details:</b></p>
        <p><b>URL:</b> http://localhost:5173</p>
        <p><b>Email:</b> ${adminEmail}</p>
        <p><b>Generated Password:</b> <span style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${password}</span></p>
        <br>
        <p>Please log in and change your password for security.</p>
        <p>Best regards,<br>The ExpenseFlow Team</p>`
      ).catch(err => console.error("Background email failed for Admin:", err));

      // Default rules
      const ruleId = `r-${Date.now()}`;
      const defaultRule = {
        id: ruleId,
        name: "Default Approval",
        description: "Initial approval flow",
        flowType: "Sequential",
        isManagerApproverAtStart: true,
        steps: [
          { role: "Manager", isManagerApprover: true, isRequired: true },
          { role: "Finance", isManagerApprover: false, isRequired: true }
        ]
      };

      await pool.execute(
        "INSERT INTO approval_rules (id, company_id, steps_json) VALUES (?, ?, ?)",
        [ruleId, companyId, JSON.stringify(defaultRule)]
      );

      res.json({ companyId, adminId, role: "Admin" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/company/:id", async (req, res) => {
    try {
      const [companies] = await pool.execute("SELECT * FROM companies WHERE id = ?", [req.params.id]) as any[];
      const company = companies[0];
      if (!company) return res.status(404).json({ error: "Company not found" });

      const [rules] = await pool.execute("SELECT * FROM approval_rules WHERE company_id = ?", [req.params.id]) as any[];
      res.json({ 
        ...mapCompany(company), 
        rules: rules.map((r: any) => typeof r.steps_json === 'string' ? JSON.parse(r.steps_json) : r.steps_json) 
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/approval-rules", async (req, res) => {
    const { companyId, rules } = req.body;
    try {
      await pool.execute("DELETE FROM approval_rules WHERE company_id = ?", [companyId]);
      for (const rule of rules) {
        await pool.execute(
          "INSERT INTO approval_rules (id, company_id, steps_json) VALUES (?, ?, ?)",
          [rule.id, companyId, JSON.stringify(rule)]
        );
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    const { name, email, role, managerId, companyId, department } = req.body;
    const id = `u-${Date.now()}`;
    const password = generatePassword();
    try {
      await pool.execute(
        "INSERT INTO users (id, name, email, role, manager_id, company_id, department, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, name, email, role, managerId || null, companyId, department, password]
      );
      
      // Send email to user in background
      sendEmailViaGmail(
        email,
        "Welcome to ExpenseFlow!",
        `<h3>Hello ${name},</h3>
        <p>An account has been created for you on ExpenseFlow by your organization.</p>
        <p>You can now submit and track your reimbursement claims easily.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #f1f5f9;">
        <p><b>Your Credentials:</b></p>
        <p><b>URL:</b> http://localhost:5173</p>
        <p><b>Username:</b> ${email}</p>
        <p><b>Password:</b> <span style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${password}</span></p>
        <br>
        <p>Best regards,<br>The ExpenseFlow Team</p>`
      ).catch(err => console.error("Background email failed for User:", err));

      res.json({ id, name, email, role, managerId, companyId, department });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/users", async (req, res) => {
    const { companyId, managerId } = req.query;
    console.log(`[DEBUG] GET /api/users: company=${companyId}, manager=${managerId}`);
    try {
      let users: any[];
      if (companyId) {
        [users] = await pool.execute("SELECT * FROM users WHERE company_id = ?", [companyId]) as any[];
      } else if (managerId) {
        [users] = await pool.execute("SELECT * FROM users WHERE manager_id = ?", [managerId]) as any[];
      } else {
        // No filter = No data (for safety)
        console.warn("[DEBUG] GET /api/users: No filter provided, returning EMPTY.");
        users = [];
      }
      res.json(users.map(mapUser));
    } catch (e: any) {
      console.error(`[DEBUG] GET /api/users Error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/expenses", async (req, res) => {
    const { employeeId, managerId, companyId } = req.query;
    console.log(`[GET /api/expenses] Filter: emp=${employeeId}, mgr=${managerId}, company=${companyId}`);
    try {
      let expenses: any[];
      if (employeeId) {
        [expenses] = await pool.execute(
          "SELECT e.*, u.name as employeeName FROM expenses e JOIN users u ON e.employee_id = u.id WHERE e.employee_id = ?",
          [employeeId]
        ) as any[];
      } else if (managerId) {
        [expenses] = await pool.execute(
          "SELECT e.*, u.name as employeeName FROM expenses e JOIN users u ON e.employee_id = u.id WHERE u.manager_id = ?",
          [managerId]
        ) as any[];
      } else if (companyId) {
        [expenses] = await pool.execute(
          "SELECT e.*, u.name as employeeName FROM expenses e JOIN users u ON e.employee_id = u.id WHERE u.company_id = ?",
          [companyId]
        ) as any[];
      } else {
        // ABSOLUTELY NO FALLBACK - Return empty if no identity context
        console.warn("[DEBUG] GET /api/expenses: No filter provided, returning EMPTY.");
        expenses = [];
      }
      console.log(`[GET /api/expenses] Status: OK, Rows: ${expenses.length}`);
      res.json(expenses.map(mapExpense));
    } catch (e: any) {
      console.error(`[GET /api/expenses] Error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/expenses", async (req, res) => {
    const { employeeId, amount, currency, category, description, date } = req.body;
    const id = `e-${Date.now()}`;
    
    try {
      // 1. Get Company's Default Currency
      const [users] = await pool.execute("SELECT company_id FROM users WHERE id = ?", [employeeId]) as any[];
      if (!users || !users.length) throw new Error("User not found");
      const companyId = users[0].company_id;
      
      const [companies] = await pool.execute("SELECT default_currency FROM companies WHERE id = ?", [companyId]) as any[];
      if (!companies || !companies.length) throw new Error("Company not found");
      const baseCurrency = companies[0].default_currency;
      
      // 2. Automated Currency Conversion
      let baseAmount = amount;
      if (currency !== baseCurrency) {
        console.log(`[CONVERSION] Converting ${amount} ${currency} to ${baseCurrency}`);
        try {
          const rateRes = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
          if (rateRes.ok) {
            const data = await rateRes.json() as any;
            const rates = data.rates;
            const rate = rates[baseCurrency];
            if (rate) {
              baseAmount = amount * rate;
              console.log(`[CONVERSION] Applied rate ${rate}: Result ${baseAmount} ${baseCurrency}`);
            }
          }
        } catch (convErr) {
          console.error("Conversion API failed, using raw amount:", convErr);
        }
      }

      await pool.execute(
        "INSERT INTO expenses (id, employee_id, amount, currency, base_amount, category, description, date, status, current_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0)",
        [id, employeeId, amount, currency, baseAmount, category, description, date]
      );
      
      res.json({ id, status: 'Pending', baseAmount });
    } catch (e: any) {
      console.error(`[POST /api/expenses] Error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stats", async (req, res) => {
    const { employeeId, managerId, companyId } = req.query;
    try {
      let stats: any;
      if (employeeId) {
        const [rows] = await pool.execute(`
          SELECT 
            SUM(CASE WHEN status = 'Approved' THEN base_amount ELSE 0 END) as totalSpent,
            SUM(CASE WHEN status = 'Pending' THEN base_amount ELSE 0 END) as totalPending,
            SUM(CASE WHEN status = 'Rejected' THEN base_amount ELSE 0 END) as totalRejected,
            COUNT(*) as totalCount
          FROM expenses 
          WHERE employee_id = ?
        `, [employeeId]) as any[];
        stats = rows[0];
      } else if (managerId) {
        const [rows] = await pool.execute(`
          SELECT 
            SUM(CASE WHEN e.status = 'Approved' THEN e.base_amount ELSE 0 END) as totalSpent,
            SUM(CASE WHEN e.status = 'Pending' THEN e.base_amount ELSE 0 END) as totalPending,
            SUM(CASE WHEN e.status = 'Rejected' THEN e.base_amount ELSE 0 END) as totalRejected,
            COUNT(*) as totalCount
          FROM expenses e
          JOIN users u ON e.employee_id = u.id
          WHERE u.manager_id = ?
        `, [managerId]) as any[];
        stats = rows[0];
      } else if (companyId) {
        const [rows] = await pool.execute(`
          SELECT 
            SUM(CASE WHEN e.status = 'Approved' THEN e.base_amount ELSE 0 END) as totalSpent,
            SUM(CASE WHEN e.status = 'Pending' THEN e.base_amount ELSE 0 END) as totalPending,
            SUM(CASE WHEN e.status = 'Rejected' THEN e.base_amount ELSE 0 END) as totalRejected,
            COUNT(*) as totalCount
          FROM expenses e
          JOIN users u ON e.employee_id = u.id
          WHERE u.company_id = ?
        `, [companyId]) as any[];
        stats = rows[0];
      }
      
      if (stats) {
        stats.totalSpent = Number(stats.totalSpent || 0);
        stats.totalPending = Number(stats.totalPending || 0);
        stats.totalRejected = Number(stats.totalRejected || 0);
        stats.totalCount = Number(stats.totalCount || 0);
      }
      
      res.json(stats || { totalSpent: 0, totalPending: 0, totalRejected: 0, totalCount: 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/approvals/pending", async (req, res) => {
    try {
      const [expenses]: any[] = await pool.execute(`
        SELECT e.*, u.name as employeeName 
        FROM expenses e 
        JOIN users u ON e.employee_id = u.id 
        WHERE e.status = 'Pending'
      `);
      res.json(expenses.map(mapExpense));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/approvals/action", async (req, res) => {
    const { expenseId, userId, role, action, comment } = req.body;
    const date = new Date().toISOString().split('T')[0];
    const logId = `l-${Date.now()}`;
    
    try {
      await pool.execute(
        "INSERT INTO approval_logs (id, expense_id, approver_id, role, status, comment, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [logId, expenseId, userId, role, action === 'approve' ? 'Approved' : 'Rejected', comment, date]
      );

      if (action === 'reject') {
        await pool.execute("UPDATE expenses SET status = 'Rejected' WHERE id = ?", [expenseId]);
      } else {
        const [expenses] = await pool.execute(
          "SELECT e.*, u.company_id FROM expenses e JOIN users u ON e.employee_id = u.id WHERE e.id = ?",
          [expenseId]
        ) as any[];
        const expense = expenses[0];
        const [rules] = await pool.execute("SELECT * FROM approval_rules WHERE company_id = ?", [expense.company_id]) as any[];
        const rule = rules[0];
        const steps = typeof rule.steps_json === 'string' ? JSON.parse(rule.steps_json).steps : (rule.steps_json.steps || rule.steps_json);
        
        if (expense.current_step >= steps.length - 1) {
          await pool.execute("UPDATE expenses SET status = 'Approved' WHERE id = ?", [expenseId]);
        } else {
          await pool.execute("UPDATE expenses SET current_step = current_step + 1 WHERE id = ?", [expenseId]);
        }
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/users/:id/promote", async (req, res) => {
    const { id } = req.params;
    try {
      await pool.execute("UPDATE users SET role = 'Manager' WHERE id = ?", [id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/users/:id/assign-director", async (req, res) => {
    const { id } = req.params;
    const { directorId } = req.body;
    try {
      await pool.execute("UPDATE users SET manager_id = ? WHERE id = ?", [directorId, id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/company/:id", async (req, res) => {
    const { id } = req.params;
    const { name, country, defaultCurrency } = req.body;
    try {
      await pool.execute(
        "UPDATE companies SET name = ?, country = ?, default_currency = ? WHERE id = ?",
        [name, country, defaultCurrency, id]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ocr", async (req, res) => {
    console.log("OCR Request received:", { fileName: req.body?.fileName, mimeType: req.body?.mimeType });
    try {
      const fileName = typeof req.body?.fileName === "string" ? req.body.fileName : "receipt";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "image/jpeg";
      const base64Data = typeof req.body?.base64Image === "string" ? req.body.base64Image : "";

      if (!base64Data) {
        console.warn("OCR Request: No file provided");
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const base64Image = base64Data.startsWith("data:")
        ? base64Data
        : `data:${mimeType};base64,${base64Data}`;

      console.log("Calling OCR Space API...");
      const ocrspaceFormData = new FormData();
      ocrspaceFormData.append("language", "eng");
      ocrspaceFormData.append("isOverlayRequired", "false");
      ocrspaceFormData.append("base64image", base64Image); // Use lowercase as per error message
      ocrspaceFormData.append("isTable", "true");
      ocrspaceFormData.append("scale", "true");
      ocrspaceFormData.append("OCREngine", "2");
      // ocrspaceFormData.append("fileName", fileName); // REMOVED: It's invalid according to API response

      const ocrRes = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: {
          apikey: OCRSPACE_API_KEY,
        },
        body: ocrspaceFormData,
      });

      const ocrData = await ocrRes.json() as any;
      console.log("OCR Space API Response:", JSON.stringify(ocrData, null, 2));

      if (!ocrRes.ok || ocrData.IsErroredOnProcessing || !ocrData.ParsedResults || ocrData.ParsedResults.length === 0) {
        console.error("OCR Upstream Failure:", ocrData);
        const upstreamMessage =
          (Array.isArray(ocrData.ErrorMessage) ? ocrData.ErrorMessage.join(" ") : ocrData.ErrorMessage) ||
          (ocrData.ParsedResults?.[0]?.ErrorMessage ?? null) ||
          (ocrData.ParsedResults?.[0]?.ErrorDetails ?? null) ||
          "OCR Processing failed or no text found";

        res.status(500).json({ error: upstreamMessage, details: ocrData });
        return;
      }

      const parsedText = ocrData.ParsedResults[0]?.ParsedText || "";

      let extractedAmount = 0;
      let extractedDate = "";
      let extractedMerchant = "Unknown Merchant";

      extractedDate = extractReceiptDate(parsedText);

      const amountMatches = parsedText.match(/\b\$?\s*\d+\.\d{2}\b/g);
      if (amountMatches) {
        let maxAmount = 0;
        amountMatches.forEach((m: string) => {
          const val = parseFloat(m.replace(/[^0-9.]/g, ""));
          if (val > maxAmount) maxAmount = val;
        });
        extractedAmount = maxAmount;
      }

      const lines = parsedText
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 2);
      if (lines.length > 0) {
        extractedMerchant = lines[0];
      }

      const result = {
        amount: extractedAmount,
        date: extractedDate,
        description: `Expense at ${extractedMerchant}`,
        category: "Other",
        merchantName: extractedMerchant,
        rawText: parsedText,
      };

      res.json(result);
    } catch (error) {
      console.error("OCR API Error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
