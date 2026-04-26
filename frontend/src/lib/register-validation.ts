/** Client-side format check; server uses the same rules in `normalize_email_address`. */
export function isProperEmailFormat(raw: string): boolean {
  const email = raw.trim();
  if (!email || email.length > 254) return false;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (!/^[\w.%+-]+$/.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!/^[a-zA-Z0-9-]+$/.test(label)) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  const tld = labels[labels.length - 1]!;
  return tld.length >= 2;
}

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MAX_LENGTH = 100;

export type FieldErrors = {
  email?: string;
  first_name?: string;
  last_name?: string;
  password?: string;
  confirm?: string;
  role?: string;
};

export function validateRegisterForm(input: {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  confirm: string;
  role: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const email = input.email.trim();
  const first = input.first_name.trim();
  const last = input.last_name.trim();

  if (!email) {
    errors.email = "Email is required.";
  } else if (!isProperEmailFormat(email)) {
    errors.email = "Please enter a proper email.";
  }

  if (input.role === "doctor") {
    if (!first) {
      errors.first_name = "First name is required.";
    } else if (first.length > NAME_MAX_LENGTH) {
      errors.first_name = `Use at most ${NAME_MAX_LENGTH} characters.`;
    }
  }

  if (last.length > NAME_MAX_LENGTH) {
    errors.last_name = `Use at most ${NAME_MAX_LENGTH} characters.`;
  }

  if (!input.password) {
    errors.password = "Password is required.";
  } else if (input.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!input.confirm) {
    errors.confirm = "Confirm your password.";
  } else if (input.password !== input.confirm) {
    errors.confirm = "Passwords do not match.";
  }

  if (input.role !== "patient" && input.role !== "doctor") {
    errors.role = "Select whether you are registering as a patient or a doctor.";
  }

  return errors;
}
