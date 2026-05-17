import type { User } from "./types.js";
export interface AuthGateway { login(): void; }
export type LoginToken = string;
export default async function login() { return "ok"; }
export class LoginService { loginUser() { return "x"; } }
export const login = () => "a";
export const loginUser = () => "b";
export const userLoginHandler = () => "c";
export function outer() { function nestedHelper() { return 1; } return nestedHelper(); }
export async function refreshSession() { return true; }
export const huge = () => {
  const values = [];
  for (let i = 0; i < 80; i++) {
    values.push(i);
    values.push(i * 2);
    values.push(i * 3);
  }
  for (let j = 0; j < 40; j++) {
    values.push(j + 100);
  }
  return values;
};
