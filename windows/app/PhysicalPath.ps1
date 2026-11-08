# Native child processes do not share the calling MSIX app's redirected path view.
# Resolve existing files/directories before passing them to browser/setup processes.
if (-not ('ClaudeMini.NativePhysicalPath' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace ClaudeMini {
    public static class NativePhysicalPath {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
        private static extern SafeFileHandle CreateFileW(
            string fileName, uint desiredAccess, uint shareMode,
            IntPtr securityAttributes, uint creationDisposition,
            uint flagsAndAttributes, IntPtr templateFile);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
        private static extern uint GetFinalPathNameByHandleW(
            SafeFileHandle file, StringBuilder path, uint capacity, uint flags);

        public static string Resolve(string suppliedPath, bool directory) {
            string absolute = Path.GetFullPath(suppliedPath);
            if (directory ? !Directory.Exists(absolute) : !File.Exists(absolute)) {
                throw new FileNotFoundException("The path must exist before resolving its physical location.", absolute);
            }
            const uint FileReadAttributes = 0x80;
            const uint ShareReadWriteDelete = 7;
            const uint OpenExisting = 3;
            const uint BackupSemantics = 0x02000000;
            using (SafeFileHandle handle = CreateFileW(absolute, FileReadAttributes,
                ShareReadWriteDelete, IntPtr.Zero, OpenExisting,
                directory ? BackupSemantics : 0, IntPtr.Zero)) {
                if (handle.IsInvalid) {
                    throw new Win32Exception(Marshal.GetLastWin32Error(),
                        "Cannot open the path to resolve its physical location: " + absolute);
                }
                int capacity = 512;
                while (capacity <= 32768) {
                    StringBuilder value = new StringBuilder(capacity);
                    uint length = GetFinalPathNameByHandleW(handle, value, (uint)capacity, 0);
                    if (length == 0) {
                        throw new Win32Exception(Marshal.GetLastWin32Error(),
                            "Cannot resolve the physical location: " + absolute);
                    }
                    if (length >= capacity) {
                        if (length >= 32768) break;
                        capacity = checked((int)length + 1);
                        continue;
                    }
                    string path = value.ToString();
                    if (path.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) {
                        return @"\\" + path.Substring(8);
                    }
                    // A mounted volume without a drive letter still needs its device prefix.
                    if (path.StartsWith(@"\\?\Volume{", StringComparison.OrdinalIgnoreCase)) {
                        return path;
                    }
                    if (path.StartsWith(@"\\?\", StringComparison.Ordinal)) {
                        return path.Substring(4);
                    }
                    return path;
                }
                throw new PathTooLongException("The resolved physical location exceeds the Windows path limit.");
            }
        }
    }
}
'@
}

function Resolve-PhysicalDirectory {
    param([Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string] $Path)
    [ClaudeMini.NativePhysicalPath]::Resolve($Path, $true)
}

function Resolve-PhysicalFile {
    param([Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string] $Path)
    [ClaudeMini.NativePhysicalPath]::Resolve($Path, $false)
}
