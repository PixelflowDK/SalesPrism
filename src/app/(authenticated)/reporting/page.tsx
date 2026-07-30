import { ChatReportingPage } from "@/features/reporting-page/reporting-page";

interface Props {
  params: Promise<{}>;
  searchParams: Promise<{
    pageNumber?: string;
  }>;
}

export default async function Home(props: Props) {
  const searchParams = await props.searchParams;
  return <ChatReportingPage page={Number(searchParams.pageNumber ?? 0)} />;
}
