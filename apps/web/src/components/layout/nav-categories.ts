export interface NavSubmenuItem {
  title: string;
  subtitle: string;
}

export interface NavCategory {
  label: string;
  items: NavSubmenuItem[];
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: "AI Services",
    items: [
      { title: "AI Agents", subtitle: "Custom autonomous agents" },
      { title: "Prompt Engineering", subtitle: "Optimized LLM workflows" },
      { title: "Data Labeling", subtitle: "Training data at scale" },
      { title: "Chatbots", subtitle: "Support & sales automation" },
    ],
  },
  {
    label: "Graphics & Design",
    items: [
      { title: "Logo Design", subtitle: "Brand identities" },
      { title: "Brand Style Guides", subtitle: "Complete branding systems" },
      { title: "Illustration", subtitle: "Custom artwork" },
      { title: "UI/UX Design", subtitle: "Web & mobile interfaces" },
      { title: "Web Design", subtitle: "Modern responsive websites" },
      { title: "Packaging Design", subtitle: "Product packaging" },
      { title: "Business Cards", subtitle: "Professional stationery" },
      { title: "Social Media Design", subtitle: "Posts & banners" },
    ],
  },
  {
    label: "Programming & Tech",
    items: [
      { title: "Web Development", subtitle: "Frontend & backend" },
      { title: "Mobile App Development", subtitle: "iOS & Android apps" },
      { title: "AI Development", subtitle: "LLMs & ML solutions" },
      { title: "Blockchain Development", subtitle: "Solana, Ethereum & more" },
      { title: "Desktop Applications", subtitle: "Native software" },
      { title: "DevOps & Cloud", subtitle: "CI/CD & infrastructure" },
      { title: "Cybersecurity", subtitle: "Security audits & testing" },
      { title: "API Development", subtitle: "REST & GraphQL" },
    ],
  },
  {
    label: "Digital Marketing",
    items: [
      { title: "Social Media Marketing", subtitle: "Grow your audience" },
      { title: "SEO", subtitle: "Rank higher on Google" },
      { title: "Content Marketing", subtitle: "High-converting content" },
      { title: "Email Marketing", subtitle: "Automated campaigns" },
      { title: "PPC Advertising", subtitle: "Google & Meta ads" },
      { title: "Influencer Marketing", subtitle: "Creator partnerships" },
      { title: "Marketing Strategy", subtitle: "Growth planning" },
      { title: "Analytics", subtitle: "Performance tracking" },
    ],
  },
  {
    label: "Video & Animation",
    items: [
      { title: "Video Editing", subtitle: "Professional editing" },
      { title: "Motion Graphics", subtitle: "Dynamic visuals" },
      { title: "3D Animation", subtitle: "Realistic animation" },
      { title: "Explainer Videos", subtitle: "Product storytelling" },
      { title: "Short-form Content", subtitle: "TikTok & Reels" },
      { title: "Logo Animation", subtitle: "Animated branding" },
      { title: "Visual Effects", subtitle: "VFX compositing" },
      { title: "Intro & Outro Videos", subtitle: "Channel branding" },
    ],
  },
  {
    label: "Writing & Translation",
    items: [
      { title: "Copywriting", subtitle: "Sales-focused copy" },
      { title: "Blog Writing", subtitle: "SEO articles" },
      { title: "Technical Writing", subtitle: "Documentation" },
      { title: "Translation", subtitle: "Multilingual services" },
      { title: "Proofreading", subtitle: "Grammar & editing" },
      { title: "Resume Writing", subtitle: "Career documents" },
      { title: "Script Writing", subtitle: "YouTube & ads" },
      { title: "Ghostwriting", subtitle: "Books & ebooks" },
    ],
  },
  {
    label: "Music & Audio",
    items: [
      { title: "Voice Over", subtitle: "Professional narration" },
      { title: "Music Production", subtitle: "Original music" },
      { title: "Mixing & Mastering", subtitle: "Studio quality audio" },
      { title: "Podcast Editing", subtitle: "Clean podcast production" },
      { title: "Sound Design", subtitle: "Effects & ambience" },
      { title: "Jingles", subtitle: "Brand audio" },
      { title: "Audiobook Production", subtitle: "Full narration" },
      { title: "Singing & Vocals", subtitle: "Session vocals" },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Virtual Assistant", subtitle: "Admin support" },
      { title: "Project Management", subtitle: "Team coordination" },
      { title: "Business Consulting", subtitle: "Strategy & growth" },
      { title: "Market Research", subtitle: "Industry insights" },
      { title: "Customer Support", subtitle: "Live support" },
      { title: "HR Consulting", subtitle: "Recruitment & hiring" },
      { title: "Legal Consulting", subtitle: "Business guidance" },
      { title: "Financial Planning", subtitle: "Business finance" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Accounting", subtitle: "Bookkeeping" },
      { title: "Tax Consulting", subtitle: "Tax preparation" },
      { title: "Financial Analysis", subtitle: "Reports & forecasting" },
      { title: "Investment Research", subtitle: "Market insights" },
      { title: "Payroll Services", subtitle: "Employee payroll" },
      { title: "Bookkeeping", subtitle: "Daily finances" },
      { title: "Business Valuation", subtitle: "Company valuation" },
      { title: "Financial Modelling", subtitle: "Excel models" },
    ],
  },
  {
    label: "Photography",
    items: [
      { title: "Product Photography", subtitle: "Ecommerce products" },
      { title: "Portrait Photography", subtitle: "Professional portraits" },
      { title: "Real Estate Photography", subtitle: "Property showcases" },
      { title: "Photo Editing", subtitle: "Professional retouching" },
      { title: "Event Photography", subtitle: "Events & weddings" },
      { title: "Food Photography", subtitle: "Restaurant visuals" },
      { title: "Fashion Photography", subtitle: "Apparel & lifestyle" },
      { title: "Background Removal", subtitle: "Clean cutouts" },
    ],
  },
];
