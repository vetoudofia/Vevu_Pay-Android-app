import { callPublicEdgeFunction } from "@/lib/edge-function";

export type OTPPurpose =
| "signup_verification"
| "password_reset"
| "password_change"
| "pin_change"
| "pin_reset";

export interface OTPResponse {
success: boolean;
message?: string;
error?: string;
[key: string]: any;
}

export async function sendEmailOTP(
email: string,
purpose: OTPPurpose
): Promise<OTPResponse> {
if (!email || !email.includes("@")) {
return {
success: false,
message: "Enter a valid email address.",
error: "Enter a valid email address.",
};
}

return callPublicEdgeFunction("send-otp", {
email: email.trim().toLowerCase(),
purpose,
});
}

export async function verifyEmailOTP(
email: string,
otpCode: string,
purpose: OTPPurpose
): Promise<OTPResponse> {
if (!email || !email.includes("@")) {
return {
success: false,
message: "Enter a valid email address.",
error: "Enter a valid email address.",
};
}

if (!/^\d{6}$/.test(otpCode)) {
return {
success: false,
message: "Enter a valid six-digit verification code.",
error: "Enter a valid six-digit verification code.",
};
}

return callPublicEdgeFunction("verify-otp", {
email: email.trim().toLowerCase(),
otpCode,
purpose,
});
}

export async function confirmSignupOTP(
email: string,
otpCode: string
): Promise<OTPResponse> {
if (!/^\d{6}$/.test(otpCode)) {
return {
success: false,
message: "Enter a valid six-digit verification code.",
error: "Enter a valid six-digit verification code.",
};
}

return callPublicEdgeFunction("confirm-signup", {
email: email.trim().toLowerCase(),
otpCode,
});
}

export async function resetPasswordWithOTP(
email: string,
otpCode: string,
newPassword: string
): Promise<OTPResponse> {
if (!/^\d{6}$/.test(otpCode)) {
return {
success: false,
message: "Enter a valid six-digit verification code.",
error: "Enter a valid six-digit verification code.",
};
}

if (!newPassword || newPassword.length < 8) {
return {
success: false,
message: "Password must contain at least 8 characters.",
error: "Password must contain at least 8 characters.",
};
}

return callPublicEdgeFunction("reset-password-with-otp", {
email: email.trim().toLowerCase(),
otpCode,
newPassword,
});
}
