#!/usr/bin/env pwsh
##
## C:\Users\junichi\AppData\Roaming\npm\tcp-bridge.ps1
##

$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent

$exe=""
if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows)
{
    # Fix case when both the Windows and Linux builds of Node
    # are installed in the same directory
    $exe=".exe"
}
$ret=0
if (Test-Path "$basedir/node$exe")
{
    # Support pipeline input
    if ($MyInvocation.ExpectingInput)
    {
        $input | & "$basedir/node$exe"  "$basedir/tcp-bridge.js" $args
    } else
    {
        & "$basedir/node$exe"  "$basedir/tcp-bridge.js" $args
    }
    $ret=$LASTEXITCODE
} else
{
    # Support pipeline input
    if ($MyInvocation.ExpectingInput)
    {
        $input | & "node$exe"  "$basedir/tcp-bridge.js" $args
    } else
    {
        & "node$exe"  "$basedir/tcp-bridge.js" $args
    }
    $ret=$LASTEXITCODE
}
exit $ret
