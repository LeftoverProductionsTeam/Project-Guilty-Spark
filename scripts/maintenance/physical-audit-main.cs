// Entrypoint for the existing read-only allocation scanner. These switches are
// local to this process; no Windows policy or original content is changed.
public static class SparkPhysicalMain {
    public static int Main(string[] args) {
        if(args.Length < 2 || args.Length > 3) return 2;
        System.AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling", false);
        System.AppContext.SetSwitch("Switch.System.IO.BlockLongPaths", false);
        long minimum = args.Length == 3 ? long.Parse(args[2]) : 40L * 1024 * 1024;
        SparkPhysicalAudit.Run(new string[]{"review"},
            new string[]{System.IO.Path.GetFullPath(args[0])},
            System.IO.Path.GetFullPath(args[1]), minimum, new string[0]);
        return 0;
    }
}
