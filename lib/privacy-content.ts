export const PRIVACY_LAST_UPDATED = "February 26, 2025";

export const PRIVACY_SECTIONS: {
  title: string;
  content: string[];
  linkUrl?: string;
  linkText?: string;
}[] = [
  {
    title: "Introduction",
    content: [
      "Bukmarks is operated by Yashraj Maher as an individual. We respect your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our bookmark management service.",
    ],
  },
  {
    title: "Information we collect",
    content: [
      "When you sign in with GitHub, we receive your GitHub profile information: name, email address, and profile image. You can optionally blur your name and email in the app via settings.",
      "We collect your bookmarks—titles, URLs, favicons, Open Graph images, and descriptions—and the folders you organize them in. When you add a bookmark, we fetch metadata (favicon, image preview, description) directly from the bookmarked webpage. We do not use third-party metadata APIs.",
    ],
  },
  {
    title: "How we use your information",
    content: [
      "We use your information to provide, maintain, and improve Bukmarks. Your bookmarks are stored securely and used solely to deliver the service. Your profile is displayed in the app; the blur setting lets you hide your name and email from view.",
      "Metadata fetched from bookmarked URLs is used only to enrich your bookmark cards (previews, favicons) and is not shared for other purposes.",
    ],
  },
  {
    title: "Data sharing",
    content: [
      "Your data is stored with Convex and served via Vercel. When you sign in, GitHub processes your authentication. We do not sell or share your data for advertising. We share data only with these service providers as necessary to operate Bukmarks.",
    ],
  },
  {
    title: "Cookies and similar technologies",
    content: [
      "We use essential cookies to keep you signed in (via Better Auth). We do not use third-party advertising cookies.",
    ],
  },
  {
    title: "Analytics and telemetry",
    content: [
      "We do not currently use analytics. In the future, we may add minimal telemetry (e.g., via PostHog) to understand product usage—such as daily logins, error reports, feature usage, and retention—solely to improve Bukmarks. When we do, we will update this policy and the \"Last updated\" date.",
    ],
  },
  {
    title: "Data retention",
    content: [
      "We retain your data for as long as your account is active. If you delete your account, we remove your profile and bookmarks within a reasonable period, except where we are required to retain data by law.",
    ],
  },
  {
    title: "Your rights",
    content: [
      "You have the right to access, correct, or delete your personal data. You can manage your account settings or contact us to exercise these rights. If you are in the EU or UK, you may have additional rights under applicable privacy laws (e.g., GDPR).",
    ],
  },
  {
    title: "Children",
    content: [
      "Bukmarks is not intended for users under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us.",
    ],
  },
  {
    title: "Contact",
    content: [
      "For questions about this Privacy Policy or your data, contact us via",
    ],
    linkUrl: "https://yashrajmaher.vercel.app",
    linkText: "yashrajmaher.vercel.app",
  },
];
