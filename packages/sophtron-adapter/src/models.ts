export type ApiCredentials = {
  clientId?: string;
  secret?: string;
  username?: string;
  password?: string;
  partnerId?: string;
  appKey?: string;
  basePath?: string;
  vcEndpoint?: string;
  aggregator?: string;
  available?: boolean;
  [key: string]: any;
};

export type CacheClient = {
  set: (key: string, value: any) => Promise<void> | void;
  get: (key: string) => Promise<any> | any;
};

export type LogClient = {
  info: (message: string, error?: any) => void;
  error: (message: string, data?: any) => void;
  debug: (message: string, data?: any) => void;
  trace: (message: string, data?: any) => void;
  warning: (message: string, data?: any) => void;
};

export type HttpClient = {
  get: (url: string, headers?: any) => Promise<any | undefined>;
  post: (url: string, data?: any, headers?: any) => Promise<any | undefined>;
  put: (url: string, data: any, headers?: any) => Promise<any | undefined>;
  del: (url: string, headers?: any) => Promise<any | undefined>;
  wget: (url: string) => Promise<any | undefined>;
  stream: (url: string, data: any, target: any) => Promise<any>;
};

export type AdapterDependencies = {
  logClient?: LogClient;
  httpClient?: HttpClient;
  aggregatorCredentials?: Record<string, ApiCredentials>;
  envConfig?: Record<string, string>;
};

export type AdapterConfig = {
  dependencies: AdapterDependencies;
};

export type VCDependencies = Partial<AdapterDependencies>;
