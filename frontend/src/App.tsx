import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowRightLeft,
  Wallet,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Server,
  Cpu,
  Database,
  Lock,
  LogOut,
  User,
  Mail,
  KeyRound,
  PlusCircle,
  History,
} from 'lucide-react';
import axios from 'axios';

import {
  fetchAccounts,
  fetchTransactions,
  executeTransfer,
  executeDeposit,
  executeWithdrawal,
  loginUser,
  registerUser,
} from './services/api';

import type {
  Account,
  Transaction,
  AuthUser,
} from './services/api';

// ==========================================
// TYPES
// ==========================================

interface TransferResult {
  message?: string;
  transaction?: {
    id: string;
    idempotency_key: string;
    sender_account_id: string;
    receiver_account_id: string;
    amount: string;
    currency: string;
    fx_rate: string;
    status: string;
    created_at: string;
  };
  _cached?: boolean;
  error?: string;
}

type AuthMode = 'login' | 'register';

// ==========================================
// APP
// ==========================================

export default function App() {
  // Authentication
  const [user, setUser] = useState<AuthUser | null>(() => {
    const storedUser = localStorage.getItem('auth_user');

    if (!storedUser) return null;

    try {
      return JSON.parse(storedUser);
    } catch {
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');
      return null;
    }
  });

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [postingAccountId, setPostingAccountId] = useState('');
  const [postingAmount, setPostingAmount] = useState('10.00');
  const [postingLoading, setPostingLoading] = useState(false);
  const [postingResult, setPostingResult] = useState('');


  // Transfers
  const [senderId, setSenderId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('50.00');
  const [currency, setCurrency] = useState('SGD');

  const [idempotencyKey, setIdempotencyKey] = useState(
    () => 'transfer-' + Math.random().toString(36).substring(2, 9)
  );

  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<TransferResult | null>(null);
  const [history, setHistory] = useState<TransferResult[]>([]);

  // Transactions
const [transactions, setTransactions] = useState<Transaction[]>([]);
const [loadingTransactions, setLoadingTransactions] = useState(false);

const [transactionPage, setTransactionPage] = useState(1);

const [transactionPagination, setTransactionPagination] =
  useState<TransactionPagination | null>(null);

const TRANSACTIONS_PER_PAGE = 10;

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  const handleAuthentication = async (e: React.FormEvent) => {
    e.preventDefault();

    setAuthLoading(true);
    setAuthError('');
    setAuthMessage('');

    try {
      const result =
        authMode === 'login'
          ? await loginUser({
              email: authEmail,
              password: authPassword,
            })
          : await registerUser({
              email: authEmail,
              password: authPassword,
            });

      // Save JWT and authenticated user
      localStorage.setItem('auth_token', result.token);
      localStorage.setItem('auth_user', JSON.stringify(result.user));

      setUser(result.user);
      setAuthPassword('');

      setAuthMessage(
        authMode === 'login'
          ? 'Login successful.'
          : 'Registration successful.'
      );
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setAuthError(
          error.response?.data?.error ||
            error.message ||
            'Authentication failed.'
        );
      } else {
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Authentication failed.'
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');

    setUser(null);
    setAccounts([]);
    setTransactions([]);
    setHistory([]);
    setLastResult(null);

    setSenderId('');
    setReceiverId('');
    setAuthPassword('');
    setAuthError('');
    setAuthMessage('');
    setAuthMode('login');
  };

  // ==========================================
  // LOAD ACCOUNTS
  // ==========================================

  const loadAccounts = useCallback(async () => {
    if (!localStorage.getItem('auth_token')) return;

    setLoadingAccounts(true);

    try {
      const data = await fetchAccounts();

      setAccounts(data);
      setPostingAccountId((current) =>
        data.some((account) => account.id === current)
          ? current
          : data[0]?.id ?? ''
      );

      setSenderId((current) =>
        data.some((account) => account.id === current)
          ? current
          : data[0]?.id ?? ''
      );

      setReceiverId((current) =>
        data.some((account) => account.id === current)
          ? current
          : data[1]?.id ?? ''
      );
    } catch (error) {
      console.error('Failed to load accounts:', error);

      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401
      ) {
        handleLogout();
      } else {
        setAccounts([]);
      }
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // ==========================================
  // LOAD TRANSACTIONS
  // ==========================================

  const loadTransactions = useCallback(
  async (page: number = transactionPage) => {
    if (!localStorage.getItem('auth_token')) return;

    setLoadingTransactions(true);

    try {

const data = await fetchTransactions(
  page,
  TRANSACTIONS_PER_PAGE
);


// Defensive handling: never allow undefined transactions.
setTransactions(
  Array.isArray(data?.transactions) ? data.transactions : []
);

setTransactionPagination(data?.pagination ?? null);

      setTransactionPage(page);

    } catch (error) {
      console.error('Failed to load transactions:', error);

      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401
      ) {
        handleLogout();
      } else {
        setTransactions([]);
        setTransactionPagination(null);
      }

    } finally {
      setLoadingTransactions(false);
    }
  },
  [transactionPage]
);

  useEffect(() => {
  if (!user || !localStorage.getItem('auth_token')) {
    return;
  }

  let cancelled = false;

  Promise.resolve().then(() => {
    if (cancelled) return;

    void loadAccounts();
    void loadTransactions();
  });

  return () => {
    cancelled = true;
  };
}, [user, loadAccounts, loadTransactions]);

  // ==========================================
  // CREATE WALLET
  // ==========================================

  const handleCreateWallet = async () => {
    setCreatingWallet(true);
    setWalletError('');

    try {
      // Requires POST /api/accounts to be implemented on backend.
      await axios.post(
        'http://localhost:3000/api/accounts',
        { currency: 'SGD' },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json',
          },
        }
      );

      await loadAccounts();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setWalletError(
          error.response?.data?.error ||
            'Wallet creation failed. Check the backend endpoint.'
        );
      } else {
        setWalletError(
          error instanceof Error
            ? error.message
            : 'Wallet creation failed.'
        );
      }
    } finally {
      setCreatingWallet(false);
    }
  };

  // ==========================================
  // TRANSFERS
  // ==========================================

  const generateNewKey = () => {
    setIdempotencyKey(
      'transfer-' + Math.random().toString(36).substring(2, 9)
    );
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (senderId === receiverId) {
      setLastResult({
        error: 'Sender and receiver accounts must be different.',
      });
      return;
    }

    if (!senderId || !receiverId) {
      setLastResult({
        error: 'Please select both sender and receiver accounts.',
      });
      return;
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setLastResult({
        error: 'Please enter a valid transfer amount.',
      });
      return;
    }

    setSubmitting(true);
    setLastResult(null);

    try {
      const result = await executeTransfer(
        {
          senderAccountId: senderId,
          receiverAccountId: receiverId,
          amount: parseFloat(amount),
          currency,
        },
        idempotencyKey
      );

      setLastResult(result);
      setHistory((prev) => [result, ...prev]);

      await loadAccounts();
      await loadTransactions(1);
    } catch (error: unknown) {
      let errorResult: TransferResult;

      if (axios.isAxiosError(error)) {
        errorResult = error.response?.data ?? {
          error: error.message,
        };
      } else {
        errorResult = {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown error',
        };
      }

      setLastResult(errorResult);
      setHistory((prev) => [errorResult, ...prev]);
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // DEPOSIT & WITHDRAWAL
  // ==========================================

  const handleInternalPosting = async (
    operation: 'deposit' | 'withdrawal'
  ) => {
    const selectedAccount = accounts.find(
      (account) => account.id === postingAccountId
    );

    if (!selectedAccount) {
      setPostingResult('Please select an account.');
      return;
    }

    if (selectedAccount.currency !== 'SGD') {
      setPostingResult(
        'Only SGD deposits and withdrawals are currently supported.'
      );
      return;
    }

    const numericAmount = Number(postingAmount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setPostingResult('Please enter a valid amount greater than zero.');
      return;
    }

    setPostingLoading(true);
    setPostingResult('');

    try {
      const request = {
        accountId: postingAccountId,
        amount: numericAmount,
      };

      const idempotencyKey =
        `${operation}-${crypto.randomUUID()}`;

      const result =
        operation === 'deposit'
          ? await executeDeposit(request, idempotencyKey)
          : await executeWithdrawal(request, idempotencyKey);

      setPostingResult(
        `${result.message} Transaction ID: ${result.transaction.id}`
      );

      await loadAccounts();
      await loadTransactions(1);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setPostingResult(
          error.response?.data?.error ||
          error.message ||
          'The operation failed.'
        );
      } else {
        setPostingResult(
          error instanceof Error
            ? error.message
            : 'The operation failed.'
        );
      }
    } finally {
      setPostingLoading(false);
    }
  };

  // ==========================================
  // LOGIN / REGISTER SCREEN
  // ==========================================

  if (!user || !localStorage.getItem('auth_token')) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex h-16 w-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 items-center justify-center text-indigo-400 mb-4">
              <Wallet className="h-8 w-8" />
            </div>

            <h1 className="text-2xl font-bold text-white">
              Apex Ledger
            </h1>

            <p className="text-sm text-slate-400 mt-2">
              Secure Banking & FinTech Platform
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="grid grid-cols-2 gap-2 mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthMessage('');
                }}
                className={`py-2.5 rounded-xl text-sm font-medium transition ${
                  authMode === 'login'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                  setAuthMessage('');
                }}
                className={`py-2.5 rounded-xl text-sm font-medium transition ${
                  authMode === 'register'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Register
              </button>
            </div>

            <h2 className="text-lg font-semibold text-white mb-1">
              {authMode === 'login'
                ? 'Welcome back'
                : 'Create your account'}
            </h2>

            <p className="text-xs text-slate-400 mb-6">
              {authMode === 'login'
                ? 'Sign in to access your banking dashboard.'
                : 'Register to start using Apex Ledger.'}
            </p>

            <form onSubmit={handleAuthentication} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>

                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />

                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    maxLength={255}
                    autoComplete="email"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Password
                </label>

                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-500" />

                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={authMode === 'register' ? 8 : undefined}
                    maxLength={72}
                    autoComplete={
                      authMode === 'login'
                        ? 'current-password'
                        : 'new-password'
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {authError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {authMessage && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  {authMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm py-3 rounded-xl transition flex items-center justify-center"
              >
                {authLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : authMode === 'login' ? (
                  'Sign In'
                ) : (
                  'Create Account'
                )}
              </button>
            </form>

            <p className="text-xs text-slate-500 text-center mt-6">
              Protected by JWT authentication
            </p>
          </div>

          <p className="text-xs text-slate-600 text-center mt-6">
            Apex Ledger & Bank System · Development Environment
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // AUTHENTICATED DASHBOARD
  // ==========================================

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* NAVBAR */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Wallet className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Apex Ledger & Bank System
            </h1>

            <p className="text-xs text-slate-400">
              High-Concurrency Double-Entry Core Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
            PostgreSQL + Redis
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
            <User className="h-4 w-4 text-indigo-400" />
            {user.email}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-lg transition"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* ACCOUNTS */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-slate-300 flex items-center">
                <Database className="h-4 w-4 mr-2 text-indigo-400" />
                Live Accounts
              </h2>

              <button
                onClick={loadAccounts}
                title="Refresh accounts"
                className="text-slate-400 hover:text-white transition"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loadingAccounts ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            <div className="space-y-3">
              {loadingAccounts && accounts.length === 0 && (
                <p className="text-xs text-slate-500">
                  Loading accounts...
                </p>
              )}

              {!loadingAccounts && accounts.length === 0 && (
                <div className="text-center py-5">
                  <Wallet className="h-8 w-8 text-indigo-400 mx-auto mb-3" />

                  <p className="text-sm text-slate-300 mb-1">
                    No wallets found
                  </p>

                  <p className="text-xs text-slate-500 mb-4">
                    Create your first SGD wallet to get started.
                  </p>

                  <button
                    onClick={handleCreateWallet}
                    disabled={creatingWallet}
                    className="inline-flex items-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-4 py-2.5 rounded-lg transition"
                  >
                    {creatingWallet ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <PlusCircle className="h-4 w-4 mr-2" />
                    )}
                    Create SGD Wallet
                  </button>

                  {walletError && (
                    <p className="text-xs text-rose-400 mt-3">
                      {walletError}
                    </p>
                  )}
                </div>
              )}

              {accounts.map((account, index) => (
                <div
                  key={account.id}
                  className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-indigo-300">
                      Account #{index + 1}
                    </span>

                    <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50 font-mono">
                      {account.currency}
                    </span>
                  </div>

                  <div className="text-slate-400 font-mono truncate select-all">
                    {account.id}
                  </div>

                  <div className="mt-3 flex justify-between items-center">
                    <span className="text-slate-500">
                      Available balance
                    </span>

                    <span className="text-emerald-400 font-semibold">
                      {account.currency}{' '}
                      {Number(account.balance ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}

              {accounts.length > 0 && (
                <button
                  onClick={handleCreateWallet}
                  disabled={creatingWallet}
                  className="w-full flex items-center justify-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 border border-dashed border-indigo-800/50 hover:border-indigo-500/50 rounded-xl py-2.5 transition"
                >
                  <PlusCircle className="h-4 w-4" />
                  Add SGD Wallet
                </button>
              )}

              {walletError && accounts.length > 0 && (
                <p className="text-xs text-rose-400">{walletError}</p>
              )}
            </div>
          </div>

          {/* SAFETY */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h2 className="text-sm font-medium text-slate-300 flex items-center">
              <ShieldCheck className="h-4 w-4 mr-2 text-emerald-400" />
              Safety & Concurrency Guards
            </h2>

            <div className="space-y-2.5 text-xs text-slate-400">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/50">
                <span className="flex items-center">
                  <Lock className="h-3.5 w-3.5 mr-2 text-amber-400" />
                  Pessimistic Locking
                </span>
                <span className="text-emerald-400 font-medium">
                  FOR UPDATE
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/50">
                <span className="flex items-center">
                  <Cpu className="h-3.5 w-3.5 mr-2 text-indigo-400" />
                  Deadlock Prevention
                </span>
                <span className="text-emerald-400 font-medium">
                  Sorted UUIDs
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/50">
                <span className="flex items-center">
                  <Server className="h-3.5 w-3.5 mr-2 text-rose-400" />
                  Idempotency Layer
                </span>
                <span className="text-emerald-400 font-medium">
                  Redis Cache
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* DEPOSIT & WITHDRAWAL FORM */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center">
                <Wallet className="h-5 w-5 mr-2 text-emerald-400" />
                Deposit & Withdraw
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Post funds to or from your SGD wallet through the internal ledger.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Account
              </label>
              <select
                value={postingAccountId}
                onChange={(e) => setPostingAccountId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.currency} · {account.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Amount (SGD)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={postingAmount}
                onChange={(e) => setPostingAmount(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleInternalPosting('deposit')}
                disabled={postingLoading || loadingAccounts || !postingAccountId}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs px-5 py-2.5 rounded-xl transition"
              >
                {postingLoading ? 'Processing...' : 'Deposit'}
              </button>

              <button
                type="button"
                onClick={() => handleInternalPosting('withdrawal')}
                disabled={postingLoading || loadingAccounts || !postingAccountId}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-xs px-5 py-2.5 rounded-xl transition"
              >
                {postingLoading ? 'Processing...' : 'Withdraw'}
              </button>
            </div>

            {postingResult && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs text-slate-300 break-words">
                {postingResult}
              </div>
            )}
          </div>

          {/* TRANSFER FORM */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center">
                  <ArrowRightLeft className="h-5 w-5 mr-2 text-indigo-400" />
                  Execute Atomic Transfer
                </h2>

                <p className="text-xs text-slate-400 mt-0.5">
                  Double-entry ledger transactions with idempotency protection
                </p>
              </div>

              <button
                type="button"
                onClick={generateNewKey}
                className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950/50 hover:bg-indigo-900/50 border border-indigo-800/50 px-3 py-1.5 rounded-lg transition"
              >
                Rotate Key
              </button>
            </div>

            {accounts.length < 2 && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                You need at least two accounts to perform a transfer.
              </div>
            )}

            <form onSubmit={handleTransfer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Sender Account
                  </label>

                  <select
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select sender</option>

                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.currency} · {account.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Receiver Account UUID
                  </label>

                  <input
                    type="text"
                    value={receiverId}
                    onChange={(e) => setReceiverId(e.target.value)}
                    required
                    placeholder="Receiver account UUID"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Amount
                  </label>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Currency
                  </label>

                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="SGD">SGD</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Idempotency Key
                  </label>

                  <input
                    type="text"
                    value={idempotencyKey}
                    onChange={(e) => setIdempotencyKey(e.target.value)}
                    required
                    maxLength={200}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Reuse the same key to test idempotency.
                </p>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    loadingAccounts ||
                    accounts.length === 0
                  }
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-6 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20 flex items-center"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Execute Transfer'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* LIVE RESPONSE */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-medium text-slate-300 flex items-center justify-between">
              <span>Live Ledger Response & Audit Stream</span>

              {lastResult?._cached && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-mono">
                  Redis Cache Hit
                </span>
              )}
            </h2>

            {lastResult ? (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs overflow-x-auto">
                <pre className="text-indigo-300 whitespace-pre-wrap">
                  {JSON.stringify(lastResult, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-950/40 border border-slate-800/50 p-8 text-center text-slate-500 text-xs">
                No transfer executed in this session yet.
              </div>
            )}

            {/* REQUEST HISTORY */}
            {history.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <h3 className="text-xs font-medium text-slate-400 mb-3">
                  Recent Request History
                </h3>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {history.map((item, index) => (
                    <div
                      key={`${item.transaction?.id ?? 'error'}-${index}`}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs font-mono"
                    >
                      <div className="flex items-center space-x-2">
                        {item.error ? (
                          <AlertCircle className="h-4 w-4 text-rose-400" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        )}

                        <span className="text-slate-300">
                          {item.transaction?.idempotency_key ?? 'Error Request'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3">
                        {item._cached && (
                          <span className="text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                            Cached
                          </span>
                        )}

                        <span className="text-slate-500">
                          {item.transaction?.amount
                            ? `${item.transaction.currency} ${item.transaction.amount}`
                            : 'Failed'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* TRANSACTION HISTORY */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-slate-300 flex items-center">
                <History className="h-4 w-4 mr-2 text-indigo-400" />
                Transaction History
              </h2>

              <button
                onClick={() => loadTransactions(transactionPage)}
                title="Refresh transactions"
                className="text-slate-400 hover:text-white transition"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loadingTransactions ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {loadingTransactions && transactions.length === 0 ? (
              <p className="text-xs text-slate-500">
                Loading transaction history...
              </p>
            ) : transactions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No transactions found.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                  >
                    <div className="flex justify-between items-center gap-3 mb-2">
                      <span className="font-mono text-indigo-300 truncate">
                        {transaction.idempotency_key}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded border ${
                          transaction.status === 'SETTLED'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        }`}
                      >
                        {transaction.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">
                        {transaction.currency} {transaction.amount}
                      </span>

                      <span className="text-slate-500">
                        {new Date(transaction.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 text-slate-600 font-mono truncate">
                      {transaction.id}
                    </div>
                  </div>
                ))}
              </div>
            )}

{/* TRANSACTION PAGINATION */}
{transactionPagination && (
  <div className="mt-5 pt-4 border-t border-slate-800">

    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">

      <p className="text-xs text-slate-400">
        Page {transactionPagination.page} of{' '}
        {transactionPagination.totalPages}
        {' · '}
        {transactionPagination.total} transactions
      </p>

      <div className="flex items-center gap-2">

        <button
          type="button"
          onClick={() =>
            loadTransactions(transactionPage - 1)
          }
          disabled={
            loadingTransactions ||
            !transactionPagination.hasPreviousPage
          }
          className="px-4 py-2 rounded-lg text-xs font-medium
            bg-slate-800 border border-slate-700
            text-slate-300 hover:bg-slate-700
            disabled:opacity-40 disabled:cursor-not-allowed
            transition"
        >
          Previous
        </button>

        <button
          type="button"
          onClick={() =>
            loadTransactions(transactionPage + 1)
          }
          disabled={
            loadingTransactions ||
            !transactionPagination.hasNextPage
          }
          className="px-4 py-2 rounded-lg text-xs font-medium
            bg-indigo-600 border border-indigo-500
            text-white hover:bg-indigo-500
            disabled:opacity-40 disabled:cursor-not-allowed
            transition"
        >
          Next
        </button>

      </div>
    </div>

  </div>
)}

          </div>
        </div>
      </main>
    </div>
  );
}
