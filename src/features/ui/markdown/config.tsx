import { Config } from "@markdoc/markdoc";
import { citation } from "./citation";
import { fence } from "./code-block";
import { meetingBrief } from "./meeting-brief-tag";
import { paragraph } from "./paragraph";

export const citationConfig: Config = {
  nodes: {
    paragraph,
    fence,
  },
  tags: {
    citation,
    "meeting-brief": meetingBrief,
  },
};
