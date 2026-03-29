

## 🌟 Overview

**ExpenseFlow** is a comprehensive reimbursement management system designed to streamline the expense reporting and approval process. Built for speed and accuracy, it leverages AI-powered OCR to extract data from receipts and automates multi-currency conversions in real-time.

## ✨ Key Features

- **🚀 AI-Powered OCR Scanning**: Automatically extract merchant name, date, and amount from receipt images using advanced OCR.
- **🌍 Multi-Currency Support**: Automatic conversion of foreign expenses to your organization's base currency using live exchange rates.
- **⚖️ Multi-Level Workflows**: Configurable sequential approval steps (Manager → Finance → Director).
- **📧 Automated Notifications**: Real-time email updates via Gmail API for status changes and account registrations.
- **📊 Interactive Dashboards**: Visual expense analytics and tracking for employees and managers.
- **🔐 Role-Based Access**: Specialized interfaces for Employees, Managers, Finance Teams, and Administrators.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion (Animations), Recharts (Data Viz)
- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite (Local) / MySQL (Production)
- **Integrations**: 
  - **OCR**: OCR Space API
  - **Currency**: ExchangeRate-API
  - **Email**: Google Gmail API
  - **AI**: Google Gemini (Receipt Insights)

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Reimbursement-Management
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   APP_URL="http://localhost:3000"
   ```

4. **Initialize Database**:
   The system automatically initializes the SQLite database on first run using `db_init.sql`.

5. **Run the Development Server**:
   ```bash
   npm run dev
   ```

6. **View the App**: Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```text
├── src/                # React components & frontend logic
├── server.ts           # Express server & API endpoints
├── db_init.sql        # Database schema & seed data
├── vite.config.ts      # Vite configuration
└── .env.example        # Environment template
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

<div align="center">
  Built with ❤️ for the AI Hackathon
</div>
