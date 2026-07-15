import path from "node:path";
import { auditCourse } from "./b2CourseAuditLib.mjs";

const courseRoot = path.resolve(process.argv[2] ?? "public/data/courses/b2-course");
const productionRoot = path.resolve("public/data");
const report = auditCourse({ courseRoot, productionRoot });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
