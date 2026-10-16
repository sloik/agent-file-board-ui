use framework "Foundation"
use scripting additions

-- No commands or application names are accepted from the URL.
on guidancePath(rawURL)
    set parts to current application's NSURLComponents's componentsWithString:rawURL
    if parts is missing value then error "Invalid guidance URL"
    if (parts's |scheme|() as text) is not "agent-file-board" then error "Invalid scheme"
    set actionName to parts's |host|() as text
    if actionName is not in {"open", "create", "create-vscode"} then error "Invalid action"
    if parts's |query|() is not missing value or parts's fragment() is not missing value or parts's |user|() is not missing value or parts's |port|() is not missing value then error "Unexpected URL fields"
    set decodedPath to parts's |path|()
    if decodedPath is missing value then error "Missing path"
    set cleanPath to decodedPath's stringByStandardizingPath()
    if (cleanPath as text) is not (decodedPath as text) then error "Use an absolute normalized path"
    set pattern to "^/[^[:cntrl:]]+/(?:GUIDANCE[.]md|topics/T[0-9]+[.]md)$"
    set matchRange to cleanPath's rangeOfString:pattern options:(current application's NSRegularExpressionSearch)
    if matchRange's |length| is 0 then error "Only board guidance Markdown files can be opened"
    set parentPath to cleanPath's stringByDeletingLastPathComponent()
    if (cleanPath's lastPathComponent() as text) is not "GUIDANCE.md" then set parentPath to parentPath's stringByDeletingLastPathComponent()
    set dataPath to (parentPath's stringByDeletingLastPathComponent())'s stringByDeletingLastPathComponent()
    set manager to current application's NSFileManager's defaultManager()
    if not (manager's fileExistsAtPath:(dataPath's stringByAppendingPathComponent:"config.json")) then error "This is not a board data folder"
    if not (manager's fileExistsAtPath:(dataPath's stringByAppendingPathComponent:"participants.json")) then error "This is not a registered board"
    -- Allow a symlink to the board root, but never follow one inside the board
    -- to a different file or application outside the requested guidance path.
    set relativePath to cleanPath's substringFromIndex:((dataPath's |length|()) + 1)
    set resolvedRoot to dataPath's stringByResolvingSymlinksInPath()
    set expectedPath to resolvedRoot's stringByAppendingPathComponent:relativePath
    set roomRelative to parentPath's substringFromIndex:((dataPath's |length|()) + 1)
    set expectedRoom to resolvedRoot's stringByAppendingPathComponent:roomRelative
    if (parentPath's stringByResolvingSymlinksInPath() as text) is not (expectedRoom as text) then error "Guidance parent symlinks are not supported"
    set immediateParent to cleanPath's stringByDeletingLastPathComponent()
    set parentRelative to immediateParent's substringFromIndex:((dataPath's |length|()) + 1)
    set expectedParent to resolvedRoot's stringByAppendingPathComponent:parentRelative
    if (immediateParent's stringByResolvingSymlinksInPath() as text) is not (expectedParent as text) then error "Guidance parent symlinks are not supported"
    if (cleanPath's stringByResolvingSymlinksInPath() as text) is not (expectedPath as text) then error "Guidance symlinks are not supported"
    set target to (cleanPath as text)
    set {fileAttributes, attributeError} to manager's attributesOfItemAtPath:cleanPath |error|:(reference)
    if fileAttributes is not missing value then
        set actualType to (fileAttributes's objectForKey:(current application's NSFileType)) as text
        set wantedType to (current application's NSFileTypeRegular) as text
        if actualType is not wantedType then error "Guidance must be a regular file"
    else if actionName is not "open" then
        return target
    end if
    -- Existing documents must be regular files, even for a stale Create action.
    set existingFile to (POSIX file target) as alias
    set fileInfo to info for existingFile
    if folder of fileInfo then error "Guidance must be a file"
    return target
end guidancePath

on createGuidance(rawURL)
    set parts to current application's NSURLComponents's componentsWithString:rawURL
    set actionName to parts's |host|() as text
    if actionName is not in {"create", "create-vscode"} then error "Not a create action"
    set target to my guidancePath(rawURL)
    set targetString to current application's NSString's stringWithString:target
    set parentPath to targetString's stringByDeletingLastPathComponent()
    -- The selected room/pair must already exist. Only topics may be added.
    set roomPath to parentPath
    if (targetString's lastPathComponent() as text) is not "GUIDANCE.md" then set roomPath to parentPath's stringByDeletingLastPathComponent()
    set roomFile to (POSIX file (roomPath as text)) as alias
    if not (folder of (info for roomFile)) then error "Room must be a directory"
    set manager to current application's NSFileManager's defaultManager()
    if (parentPath as text) is not (roomPath as text) then
        set {madeDirectory, directoryError} to manager's createDirectoryAtPath:parentPath withIntermediateDirectories:false attributes:(missing value) |error|:(reference)
        -- An existing topics directory is fine; validation below rejects a file/symlink.
    end if
    set target to my guidancePath(rawURL)
    set emptyData to current application's NSData's |data|()
    -- Foundation uses exclusive creation: never truncate an existing file or
    -- block on a FIFO that appeared since validation. Validate the result below.
    set {written, writeError} to emptyData's writeToFile:target options:(current application's NSDataWritingWithoutOverwriting) |error|:(reference)
    parts's setHost:"open"
    return my guidancePath(parts's |string|() as text)
end createGuidance

on open location rawURL
    try
        set parts to current application's NSURLComponents's componentsWithString:rawURL
        set actionName to parts's |host|() as text
        if actionName is in {"create", "create-vscode"} then
            set target to my createGuidance(rawURL)
        else
            set target to my guidancePath(rawURL)
        end if
        if actionName is "create-vscode" then
            parts's setScheme:"vscode"
            parts's setHost:"file"
            do shell script "/usr/bin/open " & quoted form of (parts's |string|() as text)
        else
            do shell script "/usr/bin/open " & quoted form of target
        end if
    on error messageText
        display alert "Cannot open board guidance" message messageText
    end try
end open location
