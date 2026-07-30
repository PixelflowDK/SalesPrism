export default async function Home() {
  return (
    <div className=" p-10">
      <div className="flex-col">
        {/* SR-004 — 20px/600 weight is below the AA large-text exemption
            (needs >=24px normal or >=19px bold); use the AA-safe text-primary-text. */}
        <h1 className="text-xl font-semibold text-primary-text">
          You are not authorized to view this page
        </h1>
        <p className="mt-5">This page can only be viewed by admin users.</p>
      </div>
    </div>
  );
}
