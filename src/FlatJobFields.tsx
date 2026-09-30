import {
  flatLabels,
  flattenJob,
  safeJobUrl,
  type JobProfile,
} from "./jd-schema";
export function FlatJobFields({ profile }: { profile: JobProfile }) {
  const fields = flattenJob(profile);
  return (
    <dl className="flat-fields">
      {Object.entries(flatLabels).map(([key, label]) => {
        const v = fields[key as keyof typeof fields];
        return (
          <div key={key}>
            <dt>
              {label}
              <small>{key}</small>
            </dt>
            <dd>
              {key === "job_url" && typeof v === "string" && safeJobUrl(v) ? (
                <a href={v} target="_blank" rel="noopener noreferrer">
                  {v}
                </a>
              ) : Array.isArray(v) ? (
                v.join("、") || "未提供"
              ) : (
                v || "未提供"
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
