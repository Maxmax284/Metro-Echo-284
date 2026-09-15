// Client mirror of the shared read catalog. One contract, both runtimes.
export {
  ECHO_READ_NAMES,
  ECHO_READ_TOOLS,
  READ_SOURCE,
  isEchoRead,
  readsBlock,
  readProvenance,
  type EchoReadName,
  type EchoReadResult,
} from "../../supabase/functions/_shared/echoReads";
