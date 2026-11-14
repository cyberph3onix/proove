import { Suspense } from "react";
import { BrowseJobs } from "./browse-jobs";

export const metadata = { title: "Browse jobs" };

export default function BrowseJobsPage() {
  return (
    <Suspense>
      <BrowseJobs />
    </Suspense>
  );
}
