
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==========================================
// AUTHENTICATION TYPES
// ==========================================

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  user: AuthUser;
  token: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ==========================================
// TRANSFER TYPES
// ==========================================

export interface TransferRequest {
  senderAccountId: string;
  receiverAccountId: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
}

export interface TransferResponse {
  message: string;
  transaction: {
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
}

// ==========================================
// ACCOUNT TYPES
// ==========================================

export interface Account {
  id: string;
  user_id: string;
  currency: string;
  balance: string;
}

// ==========================================
// TRANSACTION TYPES
// ==========================================

export interface Transaction {
  id: string;
  idempotency_key: string;
  sender_account_id: string;
  receiver_account_id: string;
  amount: string;
  currency: string;
  fx_rate: string;
  status: string;
  created_at: string;
}

// ==========================================
// TRANSACTION PAGINATION TYPES
// ==========================================

export interface TransactionPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedTransactionsResponse {
  transactions: Transaction[];
  pagination: TransactionPagination;
}

// ==========================================
// JWT AUTHENTICATION INTERCEPTOR
// ==========================================

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ==========================================
// AUTHENTICATION API
// ==========================================

export const registerUser = async (data: RegisterRequest) => {
  const response = await api.post<AuthResponse>('/auth/register', data);
  return response.data;
};

export const loginUser = async (data: LoginRequest) => {
  const response = await api.post<AuthResponse>('/auth/login', data);
  return response.data;
};

// ==========================================
// ACCOUNT API
// ==========================================

export const fetchAccounts = async (): Promise<Account[]> => {
  const response = await api.get<Account[]>('/accounts');
  return response.data;
};

// ==========================================
// TRANSACTION API
// ==========================================

export const fetchTransactions = async (
  page: number = 1,
  limit: number = 10
): Promise<PaginatedTransactionsResponse> => {
  const response = await api.get<PaginatedTransactionsResponse>(
    '/transactions',
    {
      params: { page, limit },
    }
  );

  return response.data;
};

// ==========================================
// TRANSFER API
// ==========================================

export const executeTransfer = async (
  data: TransferRequest,
  idempotencyKey: string
) => {
  const response = await api.post<TransferResponse>(
    '/transfers',
    data,
    {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
    }
  );

  return response.data;
};


// ==========================================
// DEPOSIT & WITHDRAWAL TYPES
// ==========================================

export interface InternalPostingRequest {
  accountId: string;
  amount: number;
}

export interface InternalPostingResponse {
  message: string;
  transaction: {
    id: string;
    idempotency_key: string;
    sender_account_id: string;
    receiver_account_id: string;
    amount: string;
    currency: string;
    status: string;
    created_at: string;
  };
}

// ==========================================
// DEPOSIT API
// ==========================================

export const executeDeposit = async (
  data: InternalPostingRequest,
  idempotencyKey: string
): Promise<InternalPostingResponse> => {
  const response = await api.post<InternalPostingResponse>(
    '/deposits',
    data,
    {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
    }
  );

  return response.data;
};

// ==========================================
// WITHDRAWAL API
// ==========================================

export const executeWithdrawal = async (
  data: InternalPostingRequest,
  idempotencyKey: string
): Promise<InternalPostingResponse> => {
  const response = await api.post<InternalPostingResponse>(
    '/withdrawals',
    data,
    {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
    }
  );

  return response.data;
};

export default api;
