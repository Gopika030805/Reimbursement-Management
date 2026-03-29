/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  Users, 
  Settings, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  Scan, 
  Upload, 
  FileText, 
  DollarSign, 
  LogOut, 
  Menu, 
  X, 
  Filter, 
  Search, 
  ArrowRight, 
  ArrowLeft,
  Building2, 
  Globe, 
  AlertCircle,
  Trash2,
  Save,
  ShieldCheck,
  UserPlus,
  TrendingUp,
  GitBranch,
  Info,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Role = 'Admin' | 'Manager' | 'Employee' | 'Finance' | 'HR' | 'Director' | 'CFO';

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId?: string;
  directorId?: string;
  companyId: string;
  department?: string;
  ruleId?: string;
  password?: string;
}

interface Company {
  id: string;
  name: string;
  defaultCurrency: string;
  country: string;
}

interface Expense {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  currency: string;
  baseAmount: number; // Converted to company default
  category: string;
  description: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Escalated';
  receiptUrl?: string;
  currentStep: number;
  approvals: {
    role: Role;
    status: 'Pending' | 'Approved' | 'Rejected';
    comment?: string;
    approverName?: string;
    date?: string;
  }[];
}

type ApprovalFlowType = 'Basic' | 'Sequential' | 'Parallel' | 'Conditional' | 'Hybrid';

interface ApprovalStep {
  role: Role;
  isManagerApprover: boolean;
  isRequired: boolean;
  percentageRequired?: number; // e.g., 60
  specificApproverId?: string; // e.g., CFO override for this step
}

interface ApprovalRule {
  id: string;
  name: string;
  description: string;
  companyId: string;
  flowType: ApprovalFlowType;
  steps: ApprovalStep[];
  globalSpecificApproverId?: string; // e.g., CFO override for the whole rule
  globalPercentageRequired?: number; // Global threshold
  isManagerApproverAtStart: boolean;
}

// --- Mock Data ---
const MOCK_COMPANY: Company = {
  id: 'comp-1',
  name: 'Acme Corp',
  defaultCurrency: 'USD',
  country: 'United States',
};

const MOCK_USERS: User[] = [
  { id: 'u-1', name: 'Alice Admin', email: 'alice@acme.com', role: 'Admin', companyId: 'comp-1' },
  { id: 'u-2', name: 'Bob Manager', email: 'bob@acme.com', role: 'Manager', companyId: 'comp-1' },
  { id: 'u-3', name: 'Charlie Employee', email: 'charlie@acme.com', role: 'Employee', managerId: 'u-2', companyId: 'comp-1', department: 'Engineering' },
  { id: 'u-4', name: 'Diana Finance', email: 'diana@acme.com', role: 'Finance', companyId: 'comp-1' },
  { id: 'u-5', name: 'Frank Manager', email: 'manager1@acme.com', role: 'Manager', companyId: 'comp-1', department: 'Operations' },
  { id: 'u-6', name: 'Grace Manager', email: 'manager2@acme.com', role: 'Manager', companyId: 'comp-1', department: 'Product' },
  { id: 'u-7', name: 'Henry Employee', email: 'emp1@acme.com', role: 'Employee', managerId: 'u-5', companyId: 'comp-1', department: 'Engineering' },
  { id: 'u-8', name: 'Ivy Employee', email: 'emp2@acme.com', role: 'Employee', managerId: 'u-5', companyId: 'comp-1', department: 'Sales' },
  { id: 'u-9', name: 'Jack Employee', email: 'emp3@acme.com', role: 'Employee', managerId: 'u-6', companyId: 'comp-1', department: 'Support' },
];

const MOCK_EXPENSES: Expense[] = [
  {
    id: 'e-1',
    employeeId: 'u-3',
    employeeName: 'Charlie Employee',
    amount: 150.50,
    currency: 'EUR',
    baseAmount: 165.55,
    category: 'Travel',
    description: 'Taxi to airport',
    date: '2026-03-25',
    status: 'Pending',
    currentStep: 0,
    approvals: [
      { role: 'Manager', status: 'Pending' },
      { role: 'Finance', status: 'Pending' },
    ],
  },
  {
    id: 'e-2',
    employeeId: 'u-3',
    employeeName: 'Charlie Employee',
    amount: 45.00,
    currency: 'USD',
    baseAmount: 45.00,
    category: 'Meals',
    description: 'Client lunch',
    date: '2026-03-24',
    status: 'Approved',
    currentStep: 2,
    approvals: [
      { role: 'Manager', status: 'Approved', approverName: 'Bob Manager', date: '2026-03-24' },
      { role: 'Finance', status: 'Approved', approverName: 'Diana Finance', date: '2026-03-25' },
    ],
  },
];

const MOCK_RULES: ApprovalRule[] = [
  {
    id: 'r-1',
    name: 'Standard Workflow',
    description: 'Manager -> Finance',
    companyId: 'comp-1',
    flowType: 'Sequential',
    isManagerApproverAtStart: true,
    steps: [
      { role: 'Manager', isManagerApprover: true, isRequired: true },
      { role: 'Finance', isManagerApprover: false, isRequired: true, percentageRequired: 100 },
    ],
  },
  {
    id: 'r-2',
    name: 'High Value Rule',
    description: 'Requires 60% approval or CFO override',
    companyId: 'comp-1',
    flowType: 'Hybrid',
    isManagerApproverAtStart: false,
    globalPercentageRequired: 60,
    globalSpecificApproverId: 'CFO',
    steps: [
      { role: 'Finance', isManagerApprover: false, isRequired: true },
      { role: 'CFO', isManagerApprover: false, isRequired: true }
    ]
  }
];

// --- Components ---

const WorkflowFlowchart = ({ rule }: { rule: ApprovalRule }) => {
  return (
    <div className="p-6 bg-slate-900 rounded-2xl text-white min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md">
        {/* Start Node */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <UserPlus size={20} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Employee</span>
        </div>

        <ArrowRight size={20} className="rotate-90 text-slate-700" />

        {/* Manager at Start */}
        {rule.isManagerApproverAtStart && (
          <>
            <div className="w-full p-4 bg-slate-800 border border-indigo-500/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <p className="font-bold text-sm">Direct Manager</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Initial Approver</p>
                </div>
              </div>
              <div className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded uppercase">Required</div>
            </div>
            <ArrowRight size={20} className="rotate-90 text-slate-700" />
          </>
        )}

        {/* Steps */}
        <div className="w-full space-y-8">
          {rule?.flowType === 'Basic' ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <ShieldCheck size={16} />
                  </div>
                  <span className="font-bold text-sm">Direct Manager</span>
                </div>
                <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded uppercase">Auto-Assigned</div>
              </div>
            </div>
          ) : rule?.flowType === 'Parallel' ? (
            <div className="grid grid-cols-2 gap-4">
              {rule?.steps?.map((step, idx) => (
                <div key={idx} className="p-4 bg-slate-800 border border-slate-700 rounded-xl flex flex-col items-center gap-2 text-center">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <span className="text-xs font-bold">{idx + 1}</span>
                  </div>
                  <p className="font-bold text-sm">{step.role}</p>
                  {step.isRequired && <span className="text-[8px] font-bold text-rose-400 uppercase tracking-widest">Required</span>}
                </div>
              ))}
            </div>
          ) : rule?.flowType === 'Sequential' ? (
            <div className="space-y-6">
              {rule?.steps?.map((step, idx) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-between group hover:border-indigo-500/50 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                          <span className="text-xs font-bold">{idx + 1}</span>
                        </div>
                        <div>
                          <p className="font-bold text-sm">{step.isManagerApprover ? 'Manager' : step.role}</p>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                            {step.isRequired ? 'Required Step' : 'Optional Step'}
                          </p>
                        </div>
                      </div>
                      {step.isRequired ? (
                        <CheckCircle2 size={16} className="text-indigo-500" />
                      ) : (
                        <Clock size={16} className="text-slate-600" />
                      )}
                    </div>
                  </div>
                  {idx < (rule?.steps?.length || 0) - 1 && (
                    <div className="flex justify-center">
                      <ArrowRight size={16} className="rotate-90 text-slate-700" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="relative p-6 bg-slate-800 border border-slate-700 rounded-2xl space-y-6">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {rule?.flowType} Logic
              </div>
              
              {rule?.globalPercentageRequired && (
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-amber-400" />
                    <span className="text-xs font-bold">Threshold</span>
                  </div>
                  <span className="text-sm font-black text-amber-400">{rule.globalPercentageRequired}% Approval</span>
                </div>
              )}

              {rule?.globalSpecificApproverId && (
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span className="text-xs font-bold">Override</span>
                  </div>
                  <span className="text-sm font-black text-emerald-400">{rule.globalSpecificApproverId} Approval</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {rule?.steps?.map((step, idx) => (
                  <div key={idx} className="p-3 bg-slate-700/30 border border-slate-600 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Approver {idx + 1}</p>
                    <p className="text-xs font-bold">{step.role}</p>
                    {step.isRequired && <p className="text-[8px] font-bold text-rose-400 uppercase mt-1">Required</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <ArrowRight size={20} className="rotate-90 text-slate-700" />

        {/* End Node */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CheckCircle2 size={20} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Approved</span>
        </div>
      </div>
    </div>
  );
};

const DashboardGraph = ({ data }: { data: any[] }) => {
  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#64748b' }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#fff', 
              borderRadius: '12px', 
              border: 'none', 
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
            }} 
          />
          <Area 
            type="monotone" 
            dataKey="amount" 
            stroke="#4f46e5" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorSpent)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
      active 
        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" 
        : "text-slate-600 hover:bg-slate-100"
    )}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const Badge = ({ status }: { status: Expense['status'] }) => {
  const styles = {
    'Pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'Approved': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Rejected': 'bg-rose-100 text-rose-700 border-rose-200',
    'Escalated': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  };
  return (
    <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border", styles[status])}>
      {status}
    </span>
  );
};

const UserDashboard = ({ user, stats, expenses, onBack, onPromote, onAddEmployee, isAdmin, team }: { 
  user: User, 
  stats: any, 
  expenses: Expense[], 
  onBack: () => void,
  onPromote?: (id: string) => void,
  onAddEmployee?: () => void,
  isAdmin?: boolean,
  team?: User[]
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{user.name}</h2>
            <p className="text-slate-500 text-sm">{user.role} • {user.email}</p>
          </div>
        </div>
        {isAdmin && user.role === 'Manager' && onAddEmployee && (
          <button 
            onClick={onAddEmployee}
            className="ml-auto flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
          >
            <UserPlus size={18} />
            <span>Add Employee</span>
          </button>
        )}
        {isAdmin && user.role === 'Employee' && onPromote && (
          <button 
            onClick={() => onPromote(user.id)}
            className="ml-auto flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
          >
            <TrendingUp size={18} />
            <span>Promote to Manager</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-emerald-50 border-emerald-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-emerald-600 uppercase">Approved</p>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-900">${(stats?.totalSpent || 0).toFixed(2)}</p>
        </Card>
        <Card className="p-6 bg-amber-50 border-amber-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-amber-600 uppercase">Pending</p>
            <Clock size={16} className="text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-900">${(stats?.totalPending || 0).toFixed(2)}</p>
        </Card>
        <Card className="p-6 bg-rose-50 border-rose-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-rose-600 uppercase">Rejected</p>
            <XCircle size={16} className="text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-900">${(stats?.totalRejected || 0).toFixed(2)}</p>
        </Card>
      </div>

      {team && team.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" />
            Assigned Team ({team.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {team?.map(emp => (
              <div key={emp.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                  {emp.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{emp.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{emp.email}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-900">Expense History</h3>
          <span className="text-xs text-slate-500 font-medium">{expenses.length} total claims</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses?.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900 text-sm">{exp.description}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold uppercase px-2 py-1 bg-slate-100 text-slate-600 rounded-md border border-slate-200">{exp.category}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{exp.date}</td>
                  <td className="px-6 py-4 text-right">
                    <p className="font-bold text-slate-900 text-sm">${(exp.baseAmount || 0).toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">{exp.amount} {exp.currency}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge status={exp.status} />
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No expense history found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};

const Card = ({ children, className, ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <div className={cn("bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden", className)} {...props}>
    {children}
  </div>
);

// --- Main App ---



export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [view, setView] = useState<'Auth' | 'Signup' | 'Dashboard'>('Auth');
  const [activeTab, setActiveTab] = useState<'Overview' | 'Expenses' | 'Approvals' | 'Users' | 'Managers' | 'Employees' | 'ApprovalRules'>('Overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedRuleIdForNewUser, setSelectedRuleIdForNewUser] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [stats, setStats] = useState<{ totalSpent: number, totalPending: number, totalRejected: number, totalCount: number }>({
    totalSpent: 0, totalPending: 0, totalRejected: 0, totalCount: 0
  });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserExpenses, setSelectedUserExpenses] = useState<Expense[]>([]);
  const [selectedUserStats, setSelectedUserStats] = useState<{ totalSpent: number, totalPending: number, totalRejected: number, totalCount: number } | null>(null);
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expenseFilter, setExpenseFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [newUserRole, setNewUserRole] = useState<Role>('Employee');

  const [submitForm, setSubmitForm] = useState({
    amount: '',
    currency: 'USD',
    category: 'Other',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: ''
  });

  // Fetch data from API
  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const queryParams = user.role === 'Employee' ? `?employeeId=${user.id}` : '';
      const statsParams = user.role === 'Employee' ? `?employeeId=${user.id}` : (user.role === 'Manager' ? `?managerId=${user.id}` : `?companyId=${user.companyId}`);
      
      const [expRes, userRes, compRes, statsRes, teamRes] = await Promise.all([
        fetch(`/api/expenses${queryParams}`),
        fetch(`/api/users?companyId=${user.companyId}`),
        fetch(`/api/company/${user.companyId}`),
        fetch(`/api/stats${statsParams}`),
        user.role === 'Manager' ? fetch(`/api/users?managerId=${user.id}`) : Promise.resolve(null)
      ]);
      
      if (expRes.ok) setExpenses(await expRes.json());
      if (userRes.ok) setUsers(await userRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (teamRes && teamRes.ok) setTeam(await teamRes.json());
      
      if (compRes.ok) {
        const compData = await compRes.json();
        setCompany({
          id: compData.id,
          name: compData.name,
          defaultCurrency: compData.default_currency,
          country: compData.country
        });
        setRules(compData.rules || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDetails = async (uId: string) => {
    try {
      const [expRes, statsRes] = await Promise.all([
        fetch(`/api/expenses?employeeId=${uId}`),
        fetch(`/api/stats?employeeId=${uId}`)
      ]);
      if (expRes.ok) setSelectedUserExpenses(await expRes.json());
      if (statsRes.ok) setSelectedUserStats(await statsRes.json());
    } catch (error) {
      console.error("Failed to fetch user details:", error);
    }
  };

  const handlePromoteToManager = async (uId: string) => {
    try {
      const res = await fetch(`/api/users/${uId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'Manager' }),
      });
      if (res.ok) {
        fetchData();
        alert("User promoted to Manager successfully!");
      }
    } catch (error) {
      console.error("Failed to promote user:", error);
    }
  };

  const handleAssignManager = async (managerId: string, directorId: string) => {
    try {
      const res = await fetch(`/api/users/${managerId}/assign-director`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directorId }),
      });
      if (res.ok) {
        fetchData();
        alert("Manager assigned to Director successfully!");
      }
    } catch (error) {
      console.error("Failed to assign manager:", error);
    }
  };

  const handleUpdateCompanyProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    try {
      const res = await fetch(`/api/company/${user.companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        fetchData();
        alert("Company profile updated successfully!");
      }
    } catch (error) {
      console.error("Failed to update company profile:", error);
    }
  };

  useEffect(() => {
    if (view === 'Dashboard') {
      fetchData();
    }
  }, [view, user]);

  // Mock Login (Role based simulation)
  const handleLogin = (role: Role) => {
    const mockUser = MOCK_USERS.find(u => u.role === role) || MOCK_USERS[2];
    setUser(mockUser);
    setView('Dashboard');
    setActiveTab('Overview');
  };

  const handleRealLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const { email, password } = Object.fromEntries(formData.entries());
    
    setIsLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setView('Dashboard');
        setActiveTab('Overview');
      } else {
        alert("Invalid email or password");
      }
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setView('Auth');
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        // Auto login
        const newUser: User = {
          id: result.adminId,
          name: data.adminName as string,
          email: data.adminEmail as string,
          role: 'Admin',
          companyId: result.companyId
        };
        setUser(newUser);
        setView('Dashboard');
        setActiveTab('Overview');
      }
    } catch (error) {
      console.error("Signup failed:", error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      ...Object.fromEntries(formData.entries()),
      companyId: user.companyId
    };

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        fetchData();
        (e.target as HTMLFormElement).reset();
        setSelectedRuleIdForNewUser('');
      }
    } catch (error) {
      console.error("Failed to create user:", error);
    }
  };

  const handleSaveRules = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/approval-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: user.companyId,
          rules: rules
        }),
      });
      if (res.ok) {
        alert("Approval rules saved successfully!");
        fetchData();
      }
    } catch (error) {
      console.error("Failed to save rules:", error);
    }
  };

  const handleOCR = async (file: File) => {
    setIsScanning(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          resolve(base64.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Image: base64Data,
          mimeType: file.type,
          fileName: file.name
        })
      });

      if (!response.ok) {
        throw new Error(`OCR request failed: ${response.statusText}`);
      }

      const data = await response.json();
      setSubmitForm(prev => ({
        ...prev,
        amount: data.amount?.toString() || prev.amount,
        currency: data.currency || prev.currency,
        category: data.category || prev.category,
        date: data.date || prev.date,
        description: data.description || prev.description
      }));
    } catch (error: any) {
      console.error("OCR failed:", error);
      alert(`OCR Failed: ${error.message || "Unknown error"}. Please make sure your server is running and your image is within size limits (free tier is usually < 1MB).`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmitExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    if (!submitForm.amount || isNaN(parseFloat(submitForm.amount))) {
      alert("Please enter a valid amount");
      return;
    }

    const data = {
      employeeId: user.id,
      amount: parseFloat(submitForm.amount),
      currency: submitForm.currency,
      baseAmount: parseFloat(submitForm.amount), // In a real app, use an exchange rate API
      category: submitForm.category,
      description: submitForm.description,
      date: submitForm.date,
    };

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowSubmitModal(false);
        setSubmitForm({
          amount: '',
          currency: 'USD',
          category: 'Other',
          date: format(new Date(), 'yyyy-MM-dd'),
          description: ''
        });
        fetchData();
      }
    } catch (error) {
      console.error("Failed to submit expense:", error);
    }
  };

  const handleApprovalAction = async (expenseId: string, action: 'approve' | 'reject') => {
    if (!user) return;
    try {
      const res = await fetch('/api/approvals/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseId,
          userId: user.id,
          role: user.role,
          action,
          comment: 'Approved via prototype'
        }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to process approval:", error);
    }
  };

  if (view === 'Auth') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-xl mb-4">
              <Receipt className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">ReimbursePro</h1>
            <p className="text-slate-500 mt-2">Smart expense management for modern teams</p>
          </div>

          <Card className="p-8">
            <h2 className="text-xl font-semibold mb-6 text-center">Login to your Account</h2>
            
            <form onSubmit={handleRealLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Email Address</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    name="email"
                    type="email" 
                    placeholder="name@company.com" 
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Password</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    name="password"
                    type="password" 
                    placeholder="••••••••" 
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all outline-none"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500 font-bold">Or Simulation Login</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(['Admin', 'Manager', 'Employee'] as Role[]).map((role) => (
                <button
                  key={role}
                  onClick={() => handleLogin(role)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-100 text-slate-500 group-hover:text-indigo-600 transition-colors">
                    {role === 'Admin' ? <Settings size={18} /> : role === 'Manager' ? <Users size={18} /> : <FileText size={18} />}
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 group-hover:text-indigo-600">{role}</span>
                </button>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <p className="text-center text-sm text-slate-500">
                New company? <button onClick={() => setView('Signup')} className="text-indigo-600 font-semibold hover:underline">Create an account</button>
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (view === 'Signup') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Create Company Account</h1>
            <p className="text-slate-500 mt-2">Set up your organization's reimbursement system</p>
          </div>

          <Card className="p-8">
            <form onSubmit={handleSignup} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Building2 size={18} className="text-indigo-600" />
                    Company Details
                  </h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Company Name</label>
                    <input name="companyName" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Acme Corp" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Country</label>
                    <select name="country" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="India">India</option>
                      <option value="Germany">Germany</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Default Currency</label>
                    <select name="defaultCurrency" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="INR">INR (₹)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Users size={18} className="text-indigo-600" />
                    Admin Details
                  </h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Full Name</label>
                    <input name="adminName" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email Address</label>
                    <input name="adminEmail" type="email" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="john@company.com" />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                <button type="button" onClick={() => setView('Auth')} className="text-slate-600 font-bold hover:underline">Back to Login</button>
                <button type="submit" className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2">
                  <span>Create Account</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 transition-all duration-300",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="h-full flex flex-col p-4">
          <div className="flex items-center gap-3 px-2 mb-10">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Receipt className="text-white" size={24} />
            </div>
            {isSidebarOpen && <span className="font-bold text-xl tracking-tight">ReimbursePro</span>}
          </div>

          <nav className="flex-1 space-y-2">
            <SidebarItem 
              icon={LayoutDashboard} 
              label={isSidebarOpen ? "Dashboard" : ""} 
              active={activeTab === 'Overview'} 
              onClick={() => setActiveTab('Overview')} 
            />
            {user?.role === 'Employee' && (
              <SidebarItem 
                icon={Receipt} 
                label={isSidebarOpen ? "My Expenses" : ""} 
                active={activeTab === 'Expenses'} 
                onClick={() => setActiveTab('Expenses')} 
              />
            )}
            {user?.role === 'Manager' && (
              <SidebarItem 
                icon={Users} 
                label={isSidebarOpen ? "Manager" : ""} 
                active={activeTab === 'Users'} 
                onClick={() => setActiveTab('Users')} 
              />
            )}
            {(user?.role === 'Manager' || user?.role === 'Admin') && (
              <SidebarItem 
                icon={CheckCircle2} 
                label={isSidebarOpen ? "Approvals" : ""} 
                active={activeTab === 'Approvals'} 
                onClick={() => setActiveTab('Approvals')} 
              />
            )}
            {user?.role === 'Admin' && (
              <>
                <SidebarItem 
                  icon={Users} 
                  label={isSidebarOpen ? "Managers" : ""} 
                  active={activeTab === 'Managers'} 
                  onClick={() => setActiveTab('Managers')} 
                />
                <SidebarItem 
                  icon={UserPlus} 
                  label={isSidebarOpen ? "Employees" : ""} 
                  active={activeTab === 'Employees'} 
                  onClick={() => setActiveTab('Employees')} 
                />
                <SidebarItem 
                  icon={Settings} 
                  label={isSidebarOpen ? "Approval Rules" : ""} 
                  active={activeTab === 'ApprovalRules'} 
                  onClick={() => setActiveTab('ApprovalRules')} 
                />
              </>
            )}
          </nav>

          <div className="pt-4 border-t border-slate-100">
            <div className={cn("flex items-center gap-3 px-2 mb-4", !isSidebarOpen && "justify-center")}>
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                {user?.name.charAt(0)}
              </div>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.role}</p>
                </div>
              )}
            </div>
            <button 
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors",
                !isSidebarOpen && "justify-center"
              )}
            >
              <LogOut size={20} />
              {isSidebarOpen && <span className="font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn("flex-1 transition-all duration-300", isSidebarOpen ? "ml-64" : "ml-20")}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-bottom border-slate-200 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
            >
              {isSidebarOpen ? <Menu size={20} /> : <ChevronRight size={20} />}
            </button>
            <h2 className="text-xl font-bold text-slate-900">{activeTab}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <button 
              onClick={() => setShowSubmitModal(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all"
            >
              <Plus size={18} />
              <span>New Expense</span>
            </button>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'Overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-8"
              >
                {user?.role === 'Employee' ? (
                  /* Employee Dashboard: Horizontal Stats -> Graph -> My Expenses */
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="p-6 bg-indigo-600 text-white border-none shadow-indigo-200 shadow-xl">
                        <p className="text-indigo-100 text-sm font-medium">Total Spent</p>
                        <h3 className="text-3xl font-bold mt-1">{company?.defaultCurrency} {stats.totalSpent?.toLocaleString() || '0'}</h3>
                        <p className="text-xs text-indigo-100 mt-2">Across {stats.totalCount} claims</p>
                      </Card>
                      <Card className="p-6 border-l-4 border-l-amber-500">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
                            <Clock size={24} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-500">Waiting Approval</p>
                            <h4 className="text-xl font-bold text-slate-900">{company?.defaultCurrency} {stats.totalPending?.toLocaleString() || '0'}</h4>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-6 border-l-4 border-l-rose-500">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-rose-50 text-rose-600">
                            <XCircle size={24} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-500">Rejected Assets</p>
                            <h4 className="text-xl font-bold text-slate-900">{company?.defaultCurrency} {stats.totalRejected?.toLocaleString() || '0'}</h4>
                          </div>
                        </div>
                      </Card>
                    </div>

                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Spending Trends</h3>
                      <DashboardGraph data={expenses} />
                    </Card>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-900">My Expenses</h3>
                        <button onClick={() => setActiveTab('Expenses')} className="text-sm text-indigo-600 font-semibold hover:underline">View All</button>
                      </div>
                      <Card className="p-0">
                        <div className="divide-y divide-slate-100">
                          {expenses.length > 0 ? expenses.slice(0, 8).map((exp) => (
                            <div key={exp.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                                  <Receipt size={20} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-sm">{exp.description}</p>
                                  <p className="text-xs text-slate-500">{exp.category} • {exp.date}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-slate-900 text-sm">{exp.currency} {(exp.amount || 0).toFixed(2)}</p>
                                <Badge status={exp.status} />
                              </div>
                            </div>
                          )) : (
                            <div className="p-12 text-center">
                              <Receipt className="text-slate-300 mx-auto mb-4" size={48} />
                              <p className="text-slate-500 font-medium">No expenses found</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : (
                  /* Manager/Admin Dashboard: Horizontal Stats -> Graph -> My Expenses -> Role-specific sections */
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="p-6 bg-indigo-600 text-white border-none shadow-indigo-200 shadow-xl">
                        <p className="text-indigo-100 text-sm font-medium">Total Spent</p>
                        <h3 className="text-3xl font-bold mt-1">{company?.defaultCurrency} {stats.totalSpent?.toLocaleString() || '0'}</h3>
                        <p className="text-xs text-indigo-100 mt-2">Across {stats.totalCount} claims</p>
                      </Card>
                      <Card className="p-6 border-l-4 border-l-amber-500">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
                            <Clock size={24} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-500">Waiting Approval</p>
                            <h4 className="text-xl font-bold text-slate-900">{company?.defaultCurrency} {stats.totalPending?.toLocaleString() || '0'}</h4>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-6 border-l-4 border-l-rose-500">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-rose-50 text-rose-600">
                            <XCircle size={24} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-500">Rejected Assets</p>
                            <h4 className="text-xl font-bold text-slate-900">{company?.defaultCurrency} {stats.totalRejected?.toLocaleString() || '0'}</h4>
                          </div>
                        </div>
                      </Card>
                    </div>

                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Spending Trends</h3>
                      <DashboardGraph data={expenses} />
                    </Card>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-900">My Expenses</h3>
                        <button onClick={() => setActiveTab('Expenses')} className="text-sm text-indigo-600 font-semibold hover:underline">View All</button>
                      </div>
                      <Card className="p-0">
                        <div className="divide-y divide-slate-100">
                          {expenses.length > 0 ? expenses.slice(0, 8).map((exp) => (
                            <div key={exp.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                                  <Receipt size={20} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-sm">{exp.description}</p>
                                  <p className="text-xs text-slate-500">{exp.category} • {exp.date}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-slate-900 text-sm">{exp.currency} {(exp.amount || 0).toFixed(2)}</p>
                                <Badge status={exp.status} />
                              </div>
                            </div>
                          )) : (
                            <div className="p-12 text-center">
                              <Receipt className="text-slate-300 mx-auto mb-4" size={48} />
                              <p className="text-slate-500 font-medium">No expenses found</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>

                    {user?.role === 'Manager' && team.length > 0 && (
                      <div className="space-y-6">
                        <h3 className="text-lg font-bold text-slate-900">My Team</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {team.slice(0, 6).map(member => (
                            <Card key={member.id} className="p-4 flex items-center gap-4 hover:border-indigo-300 transition-all cursor-pointer" onClick={() => {
                              setSelectedUser(member);
                              setActiveTab('Users');
                              fetchUserDetails(member.id);
                            }}>
                              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                {member.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 truncate">{member.name}</p>
                                <p className="text-xs text-slate-500 truncate">{member.department || 'No Department'}</p>
                              </div>
                              <ChevronRight size={18} className="text-slate-300" />
                            </Card>
                          ))}
                        </div>
                        {team.length > 6 && (
                          <button onClick={() => setActiveTab('Users')} className="text-indigo-600 font-bold text-sm hover:underline">View all {team.length} members</button>
                        )}
                      </div>
                    )}

                    {user?.role === 'Admin' && (
                      <Card className="p-6">
                        <h3 className="font-bold text-lg mb-6">Approval Rules</h3>
                        <div className="space-y-6">
                          {rules?.[0]?.steps?.map((step, i) => (
                            <div key={i} className="relative pl-8 pb-6 last:pb-0">
                              {i !== (rules[0].steps.length - 1) && (
                                <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-100" />
                              )}
                              <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                                {i + 1}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{step.role}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                  {step.isManagerApprover ? "Direct Manager" : "Departmental Head"}
                                </p>
                              </div>
                            </div>
                          ))}
                          {(!rules || rules.length === 0 || !rules[0].steps) && (
                            <p className="text-sm text-slate-500 italic">No approval rules configured.</p>
                          )}
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'Expenses' && (
              <motion.div 
                key="expenses"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit">
                    {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setExpenseFilter(status)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                          expenseFilter === status 
                            ? "bg-white text-slate-900 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search expenses..."
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <Card className="p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expenses
                          .filter(exp => expenseFilter === 'All' || exp.status === expenseFilter)
                          .filter(exp => 
                            exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            exp.category.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map((exp) => (
                            <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-sm text-slate-600">{exp.date}</td>
                              <td className="px-6 py-4">
                                <p className="text-sm font-bold text-slate-900">{exp.description}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                                  {exp.category}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-slate-900">
                                {exp.currency} {(exp.amount || 0).toFixed(2)}
                              </td>
                              <td className="px-6 py-4">
                                <Badge status={exp.status} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'Approvals' && (
              <motion.div 
                key="approvals"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">Pending Approvals</h3>
                  <Badge status="Pending" />
                </div>

                <Card className="p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Purpose & Description</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Receipt</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount & Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expenses.filter(e => e.status === 'Pending').length > 0 ? (
                          expenses.filter(e => e.status === 'Pending').map((exp) => (
                            <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                    {(exp.employeeName || exp.userId).charAt(0).toUpperCase()}
                                  </div>
                                  <p className="text-sm font-bold text-slate-900">{exp.employeeName || exp.userId}</p>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-sm font-bold text-slate-900">{exp.category}</p>
                                <p className="text-xs text-slate-500 line-clamp-1">{exp.description}</p>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600">{exp.date}</td>
                              <td className="px-6 py-4">
                                {exp.receiptUrl ? (
                                  <button className="text-indigo-600 hover:text-indigo-700 text-xs font-bold flex items-center gap-1">
                                    <Receipt size={14} />
                                    View Receipt
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-xs italic">No receipt</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex flex-col items-end gap-2">
                                  <p className="text-sm font-bold text-slate-900">{exp.currency} {(exp.amount || 0).toFixed(2)}</p>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => handleApprovalAction(exp.id, 'reject')}
                                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                                      title="Reject"
                                    >
                                      <XCircle size={18} />
                                    </button>
                                    <button 
                                      onClick={() => handleApprovalAction(exp.id, 'approve')}
                                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                                      title="Approve"
                                    >
                                      <CheckCircle2 size={18} />
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center">
                              <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                                  <CheckCircle2 size={32} />
                                </div>
                                <h4 className="text-lg font-bold text-slate-900">All caught up!</h4>
                                <p className="text-slate-500">No pending approvals at the moment.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'Users' && user?.role === 'Manager' && (
              <motion.div 
                key="users"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                {selectedUser ? (
                  <UserDashboard 
                    user={selectedUser}
                    stats={selectedUserStats}
                    expenses={selectedUserExpenses}
                    onBack={() => setSelectedUser(null)}
                    onAddEmployee={() => setShowAddUserModal(true)}
                    isAdmin={true}
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 space-y-4">
                      <h3 className="text-lg font-bold">My Team</h3>
                      <div className="space-y-3">
                        {team?.map((emp) => (
                          <button
                            key={emp.id}
                            onClick={() => {
                              setSelectedUser(emp);
                              fetchUserDetails(emp.id);
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                              selectedUser?.id === emp.id 
                                ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200" 
                                : "bg-white border-slate-200 hover:border-indigo-300"
                            )}
                          >
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{emp.name}</p>
                              <p className="text-xs text-slate-500">{emp.department || 'No Department'}</p>
                            </div>
                            <ChevronRight size={16} className="ml-auto text-slate-400" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                        <div>
                          <Users size={48} className="text-slate-300 mx-auto mb-4" />
                          <p className="text-slate-500 font-medium">Select an employee from your team to view their expense history</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'Managers' && user?.role === 'Admin' && (
              <motion.div 
                key="managers"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">Manage Managers</h3>
                  <button 
                    onClick={() => { setNewUserRole('Manager'); setShowAddUserModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all"
                  >
                    <Plus size={18} />
                    <span>Add Manager</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-4">
                    {users?.filter(u => u.role === 'Manager').map((mgr) => (
                      <Card 
                        key={mgr.id} 
                        className={cn(
                          "p-4 cursor-pointer transition-all",
                          selectedUser?.id === mgr.id ? "border-indigo-600 shadow-md" : "hover:border-indigo-200"
                        )}
                        onClick={() => setSelectedUser(mgr)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                            {mgr.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{mgr.name}</p>
                            <p className="text-xs text-slate-500">{mgr.email}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <div className="lg:col-span-2">
                    {selectedUser && selectedUser.role === 'Manager' ? (
                      <Card className="p-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h4 className="text-lg font-bold text-slate-900">{selectedUser.name}'s Team</h4>
                            <p className="text-sm text-slate-500">Employees assigned to this manager</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          {users?.filter(u => u.managerId === selectedUser.id).length > 0 ? (
                            users?.filter(u => u.managerId === selectedUser.id).map((emp) => (
                              <div key={emp.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                                    {emp.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                                    <p className="text-xs text-slate-500">{emp.email}</p>
                                  </div>
                                </div>
                                <button className="text-xs font-bold text-rose-600 hover:underline">Unassign</button>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-12">
                              <Users className="mx-auto text-slate-300 mb-2" size={32} />
                              <p className="text-slate-500 text-sm">No employees assigned yet.</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    ) : (
                      <div className="h-full flex items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
                        <div>
                          <Users className="mx-auto text-slate-300 mb-4" size={48} />
                          <p className="text-slate-500 font-medium">Select a manager to view their team</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Employees' && user?.role === 'Admin' && (
              <motion.div 
                key="employees"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">Manage Employees</h3>
                  <button 
                    onClick={() => { setNewUserRole('Employee'); setShowAddUserModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all"
                  >
                    <Plus size={18} />
                    <span>Add Employee</span>
                  </button>
                </div>

                <Card className="p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Manager</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users?.filter(u => u.role === 'Employee').map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                                  {emp.name.charAt(0)}
                                </div>
                                <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{emp.email}</td>
                            <td className="px-6 py-4">
                              <select 
                                className="text-sm bg-transparent border-none focus:ring-0 font-medium text-indigo-600 cursor-pointer"
                                value={emp.managerId || ''}
                                onChange={(e) => handleAssignManager(emp.id, e.target.value)}
                              >
                                <option value="">Unassigned</option>
                                {users?.filter(u => u.role === 'Manager').map(mgr => (
                                  <option key={mgr.id} value={mgr.id}>{mgr.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button className="text-slate-400 hover:text-indigo-600 p-2">
                                <Settings size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'Others' && user?.role === 'Admin' && (
              <motion.div 
                key="others"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                      <ShieldCheck size={20} className="text-indigo-600" />
                      High-Level Roles
                    </h3>
                    <div className="space-y-4">
                      {users.filter(u => ['Admin', 'Director', 'Finance'].includes(u.role)).map(u => (
                        <div key={u.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{u.name}</p>
                              <p className="text-xs text-slate-500">{u.role} • {u.email}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                      <GitBranch size={20} className="text-indigo-600" />
                      Hierarchy Mapping
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">Assign Managers to Directors for multi-level approval workflows.</p>
                    <div className="space-y-6">
                      {users.filter(u => u.role === 'Manager').map(m => (
                        <div key={m.id} className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Manager: {m.name}</label>
                          <select 
                            value={m.directorId || ''}
                            onChange={(e) => handleAssignManager(m.id, e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          >
                            <option value="">No Director Assigned</option>
                            {users.filter(u => u.role === 'Director').map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}

            {activeTab === 'ApprovalRules' && user?.role === 'Admin' && (
              <motion.div 
                key="approval-rules"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-8"
              >
                <div className="space-y-8">
                  <Card className="p-8">
                    <h3 className="text-xl font-bold text-slate-900 mb-6">Company Profile</h3>
                    <form onSubmit={handleUpdateCompanyProfile} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Base Currency</label>
                        <select name="defaultCurrency" defaultValue={company?.defaultCurrency} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="INR">INR (₹)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Country</label>
                        <input name="country" defaultValue={company?.country} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all">
                          Update Profile
                        </button>
                      </div>
                    </form>
                  </Card>

                  <Card className="p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">Approval Workflow Rules</h3>
                        <p className="text-sm text-slate-500 mt-1">Define the sequence and conditions for expense approvals</p>
                      </div>
                      <button 
                        onClick={() => {
                          const newRule: ApprovalRule = {
                            id: `rule-${Date.now()}`,
                            name: 'New Custom Rule',
                            description: 'Custom approval sequence',
                            companyId: company?.id || '',
                            flowType: 'Sequential',
                            isManagerApproverAtStart: true,
                            steps: [{ role: 'Manager', isManagerApprover: true, isRequired: true }]
                          };
                          setRules([...rules, newRule]);
                        }}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                      >
                        <Plus size={18} />
                        <span>Add New Rule</span>
                      </button>
                    </div>

                    <div className="space-y-8">
                      {rules.map((rule, idx) => (
                        <div key={rule.id} className="p-8 border border-slate-100 rounded-3xl bg-slate-50/50 space-y-8">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* Left: Configuration */}
                            <div className="space-y-8">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-lg shadow-indigo-200">
                                    {idx + 1}
                                  </div>
                                  <div>
                                    <input 
                                      className="font-bold text-lg text-slate-900 bg-transparent border-none focus:ring-0 p-0"
                                      value={rule.name}
                                      onChange={(e) => {
                                        const newRules = [...rules];
                                        newRules[idx].name = e.target.value;
                                        setRules(newRules);
                                      }}
                                    />
                                    <input 
                                      className="text-sm text-slate-500 bg-transparent border-none focus:ring-0 p-0 block w-full"
                                      value={rule.description}
                                      onChange={(e) => {
                                        const newRules = [...rules];
                                        newRules[idx].description = e.target.value;
                                        setRules(newRules);
                                      }}
                                    />
                                  </div>
                                </div>
                                <button 
                                  onClick={() => setRules(rules.filter(r => r.id !== rule.id))}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                >
                                  <Trash2 size={20} />
                                </button>
                              </div>

                              <div className="space-y-6">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Flow Type</label>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {['Basic', 'Sequential', 'Parallel', 'Conditional', 'Hybrid'].map((type) => (
                                      <button
                                        key={type}
                                        onClick={() => {
                                          const newRules = [...rules];
                                          newRules[idx].flowType = type as ApprovalFlowType;
                                          setRules(newRules);
                                        }}
                                        className={cn(
                                          "px-2 py-3 rounded-xl border-2 text-[10px] font-bold transition-all text-center uppercase tracking-wider",
                                          rule.flowType === type 
                                            ? "bg-indigo-50 border-indigo-600 text-indigo-600" 
                                            : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                                        )}
                                      >
                                        {type}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                                  <div className="flex-1">
                                    <p className="text-sm font-bold text-indigo-900">Manager as Initial Approver</p>
                                    <p className="text-[10px] text-indigo-600 uppercase font-bold tracking-wider">Approval always starts with the user's manager</p>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      const newRules = [...rules];
                                      newRules[idx].isManagerApproverAtStart = !newRules[idx].isManagerApproverAtStart;
                                      setRules(newRules);
                                    }}
                                    className={cn(
                                      "w-12 h-6 rounded-full transition-all relative",
                                      rule.isManagerApproverAtStart ? "bg-indigo-600" : "bg-slate-300"
                                    )}
                                  >
                                    <div className={cn(
                                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                      rule.isManagerApproverAtStart ? "left-7" : "left-1"
                                    )} />
                                  </button>
                                </div>

                                {(rule.flowType === 'Conditional' || rule.flowType === 'Hybrid') && (
                                  <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl">
                                    <div className="space-y-2">
                                      <label className="block text-[10px] font-bold text-amber-600 uppercase tracking-widest">Approval Threshold (%)</label>
                                      <input 
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={rule.globalPercentageRequired || ''}
                                        onChange={(e) => {
                                          const newRules = [...rules];
                                          newRules[idx].globalPercentageRequired = parseInt(e.target.value);
                                          setRules(newRules);
                                        }}
                                        placeholder="e.g. 60"
                                        className="w-full px-4 py-2 bg-white border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block text-[10px] font-bold text-amber-600 uppercase tracking-widest">Specific Approver (Override)</label>
                                      <select 
                                        value={rule.globalSpecificApproverId || ''}
                                        onChange={(e) => {
                                          const newRules = [...rules];
                                          newRules[idx].globalSpecificApproverId = e.target.value;
                                          setRules(newRules);
                                        }}
                                        className="w-full px-4 py-2 bg-white border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                      >
                                        <option value="">None</option>
                                        <option value="CFO">CFO</option>
                                        <option value="CEO">CEO</option>
                                        <option value="Finance Director">Finance Director</option>
                                      </select>
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approval Steps</label>
                                    <button 
                                      onClick={() => {
                                        const newRules = [...rules];
                                        newRules[idx].steps.push({ role: 'Finance', isManagerApprover: false, isRequired: true });
                                        setRules(newRules);
                                      }}
                                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                    >
                                      <Plus size={14} />
                                      <span>Add Step</span>
                                    </button>
                                  </div>
                                  <div className="space-y-3">
                                    {rule?.steps?.map((step, sIdx) => (
                                      <div key={sIdx} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm group">
                                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                                          {sIdx + 1}
                                        </div>
                                        <div className="flex-1 flex items-center gap-4">
                                          <select 
                                            className="flex-1 bg-transparent border-none focus:ring-0 font-bold text-sm text-slate-700"
                                            value={step.role}
                                            onChange={(e) => {
                                              const newRules = [...rules];
                                              newRules[idx].steps[sIdx].role = e.target.value as Role;
                                              setRules(newRules);
                                            }}
                                          >
                                            <option value="Manager">Direct Manager</option>
                                            <option value="Director">Director</option>
                                            <option value="Finance">Finance</option>
                                            <option value="HR">HR</option>
                                            <option value="CFO">CFO</option>
                                            <option value="Admin">Admin</option>
                                          </select>
                                          <div className="flex items-center gap-2">
                                            <input 
                                              type="checkbox"
                                              checked={step.isRequired}
                                              onChange={(e) => {
                                                const newRules = [...rules];
                                                newRules[idx].steps[sIdx].isRequired = e.target.checked;
                                                setRules(newRules);
                                              }}
                                              className="rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Required</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <input 
                                              type="checkbox"
                                              checked={step.isManagerApprover}
                                              onChange={(e) => {
                                                const newRules = [...rules];
                                                newRules[idx].steps[sIdx].isManagerApprover = e.target.checked;
                                                setRules(newRules);
                                              }}
                                              className="rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Is Manager</span>
                                          </div>
                                        </div>
                                        <button 
                                          onClick={() => {
                                            const newRules = [...rules];
                                            newRules[idx].steps = newRules[idx].steps.filter((_, i) => i !== sIdx);
                                            setRules(newRules);
                                          }}
                                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Assigned Users</label>
                                  <div className="flex flex-wrap gap-2">
                                    {users.filter(u => u.ruleId === rule.id).map(u => (
                                      <div key={u.id} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold flex items-center gap-2">
                                        {u.name}
                                        <button 
                                          onClick={() => {
                                            const newUsers = users.map(user => 
                                              user.id === u.id ? { ...user, ruleId: undefined } : user
                                            );
                                            setUsers(newUsers);
                                          }}
                                          className="hover:text-indigo-800"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ))}
                                    <select 
                                      className="px-3 py-1 bg-slate-100 border-none rounded-full text-xs font-bold text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                      onChange={(e) => {
                                        if (!e.target.value) return;
                                        const newUsers = users.map(user => 
                                          user.id === e.target.value ? { ...user, ruleId: rule.id } : user
                                        );
                                        setUsers(newUsers);
                                        e.target.value = "";
                                      }}
                                    >
                                      <option value="">+ Assign User</option>
                                      {users.filter(u => u.ruleId !== rule.id).map(u => (
                                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Right: Flowchart */}
                            <div className="space-y-4">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visual Workflow Preview</label>
                              <WorkflowFlowchart rule={rule} />
                              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                <div className="flex gap-3">
                                  <Info size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                                  <p className="text-xs text-indigo-700 leading-relaxed">
                                    {rule.flowType === 'Basic' && "Expenses will be routed directly to the employee's assigned manager for approval."}
                                    {rule.flowType === 'Sequential' && "Expenses will follow a strict step-by-step sequence. Each step must be approved before moving to the next."}
                                    {rule.flowType === 'Conditional' && `Approval requires a ${rule.globalPercentageRequired}% majority threshold or a specific override.`}
                                    {rule.flowType === 'Hybrid' && "Combines sequential steps with conditional logic for high-value or complex approvals."}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-12 flex justify-end">
                      <button 
                        onClick={handleSaveRules}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                      >
                        <Save size={20} />
                        <span>Save All Workflow Rules</span>
                      </button>
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Submit Expense Modal */}
      <AnimatePresence>
        {showSubmitModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubmitModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">Submit New Expense</h3>
                <button 
                  onClick={() => setShowSubmitModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitExpense} className="contents">
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Receipt Upload</label>
                        <label className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-indigo-400 transition-all cursor-pointer group relative">
                          <input 
                            type="file" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleOCR(file);
                            }}
                          />
                          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 mb-4 transition-all">
                            <Upload size={24} />
                          </div>
                          <p className="text-sm font-bold text-slate-900">Click to upload or drag and drop</p>
                          <p className="text-xs text-slate-500 mt-1">PNG, JPG or PDF (max. 5MB)</p>
                        </label>
                      </div>
                      <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                        <div className="flex items-center gap-3 text-indigo-700 mb-2">
                          <Scan size={18} />
                          <span className="font-bold text-sm">OCR Smart Scan</span>
                        </div>
                        <p className="text-xs text-indigo-600 leading-relaxed">
                          Upload a receipt and our OCR system will automatically extract the amount, date, and merchant for you.
                        </p>
                      </div>
                      {isScanning && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-3 p-4 bg-slate-900 text-white rounded-xl"
                        >
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          >
                            <Clock size={18} />
                          </motion.div>
                          <span className="font-bold text-sm">OCR Space is analyzing your receipt...</span>
                        </motion.div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Amount</label>
                          <input 
                            name="amount" 
                            type="number" 
                            step="0.01" 
                            required 
                            placeholder="0.00" 
                            value={submitForm.amount}
                            onChange={(e) => setSubmitForm(prev => ({ ...prev, amount: e.target.value }))}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Currency</label>
                          <select 
                            name="currency" 
                            value={submitForm.currency}
                            onChange={(e) => setSubmitForm(prev => ({ ...prev, currency: e.target.value }))}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          >
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                            <option value="INR">INR</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Category</label>
                        <select 
                          name="category" 
                          value={submitForm.category}
                          onChange={(e) => setSubmitForm(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        >
                          <option value="Travel">Travel</option>
                          <option value="Meals">Meals</option>
                          <option value="Office Supplies">Office Supplies</option>
                          <option value="Software">Software</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Date</label>
                        <input 
                          name="date" 
                          type="date" 
                          required 
                          value={submitForm.date}
                          onChange={(e) => setSubmitForm(prev => ({ ...prev, date: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Description</label>
                        <textarea 
                          name="description" 
                          rows={3} 
                          placeholder="What was this for?" 
                          value={submitForm.description}
                          onChange={(e) => setSubmitForm(prev => ({ ...prev, description: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                        ></textarea>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
                    Submit Claim
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Add User Modal */}
      <AnimatePresence>
        {showAddUserModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowAddUserModal(false); setSelectedRuleIdForNewUser(''); }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">Add Team Member</h3>
                <button 
                  onClick={() => { setShowAddUserModal(false); setSelectedRuleIdForNewUser(''); }}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={(e) => { handleCreateUser(e); setShowAddUserModal(false); }} className="p-8 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Full Name</label>
                      <input name="name" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Jane Smith" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email</label>
                      <input name="email" type="email" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="jane@company.com" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Role</label>
                        <select name="role" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                          <option value="Employee">Employee</option>
                          <option value="Manager">Manager</option>
                          <option value="Finance">Finance</option>
                          <option value="Director">Director</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Department</label>
                        <input name="department" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Engineering" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Manager</label>
                      <select name="managerId" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                        <option value="">No Manager</option>
                        {users?.filter(u => u.role === 'Manager' || u.role === 'Admin').map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Approval Rule</label>
                      <select 
                        name="ruleId" 
                        value={selectedRuleIdForNewUser}
                        onChange={(e) => setSelectedRuleIdForNewUser(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      >
                        <option value="">No Specific Rule</option>
                        {rules?.map(rule => (
                          <option key={rule.id} value={rule.id}>{rule.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <GitBranch size={16} className="text-indigo-600" />
                      <h4 className="text-xs font-bold text-slate-700 uppercase">Workflow Preview</h4>
                    </div>
                    <div className="flex-1 min-h-[300px] relative">
                      {selectedRuleIdForNewUser ? (
                        <div className="absolute inset-0 overflow-auto p-2">
                          {rules.find(r => r.id === selectedRuleIdForNewUser) && (
                            <WorkflowFlowchart rule={rules.find(r => r.id === selectedRuleIdForNewUser)!} />
                          )}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6">
                          <AlertCircle size={32} className="text-slate-300 mb-2" />
                          <p className="text-xs text-slate-500">Select an approval rule to preview the workflow flow.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="pt-4">
                  <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                    Add Member
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
