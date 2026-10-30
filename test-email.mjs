
import { Resend } from "resend";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL;
const to = process.env.TEST_EMAIL;

if (!apiKey || !from || !to) {
    throw new Error(
        "Missing RESEND_API_KEY, RESEND_FROM_EMAIL or TEST_EMAIL"
    );
}

const resend = new Resend(apiKey);

const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "Medical System - Email Test",
    html: `
    <h2>Email configuration is working!</h2>
    <p>Your medical system can now send emails using Resend.</p>
  `,
});

if (error) {
    console.error("Email failed:", error);
    process.exitCode = 1;
} else {
    console.log("Email accepted by Resend:", data?.id);
}
