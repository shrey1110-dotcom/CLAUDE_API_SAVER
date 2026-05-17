export async function loginUser(email: string, password: string) {
  return { token: "demo", user: email };
}
export function validateLoginInput(email: string) { return email.includes("@"); }
