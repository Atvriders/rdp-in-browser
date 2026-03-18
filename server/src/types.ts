export interface RDPParams {
  host: string;
  port: number;
  username: string;
  password: string;
  domain: string;
  width: number;
  height: number;
  colorDepth: number;
  security: string;
  ignoreCert: boolean;
}
