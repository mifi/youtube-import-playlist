import { Innertube, YTNodes, Utils } from 'youtubei.js';
import assert from 'node:assert';
import { readFile, writeFile } from 'fs/promises';
import pRetry from 'p-retry';


// - EDIT THESE VARIABLES -

// https://github.com/LuanRT/YouTube.js/blob/main/examples/auth/README.md
// copy from network tab of an authenticated request to https://www.youtube.com/youtubei/v1
// for example from https://www.youtube.com/feed/downloads
const cookie = ''

const playlistId = '';

// - END EDITABLE VARIABLES -


const importedDbPath = 'imported.json'
const sourcePath = 'source.json'

/* const sourceTracks = [
  {
    sourceId: '1',
    query: 'Artist - Song',
  }
]; */

const sourceTracks: { sourceId: string, query: string }[] = JSON.parse(await readFile(sourcePath) as unknown as string).playlists[0].items.map((item) => ({
  sourceId: item.track.trackUri,
  query: `${item.track.artistName} - ${item.track.trackName}`,
}))


// console.log(sourceTracks)


// https://github.com/LuanRT/YouTube.js/blob/main/docs/API/playlist.md

const youtube = await Innertube.create({ cookie });

//console.dir(await youtube.music.getPlaylist(playlistId), { depth: 10 });

type DbType = { source: { id: string, query: string }, youtube: { id: string, title: string } }[]

let importedDb: DbType = []
try {
  importedDb = JSON.parse(await readFile(importedDbPath) as unknown as string);
} catch {
  console.warn('Unable to import DB');
}


for (const { sourceId, query } of sourceTracks) {
  if (importedDb.some((imported) => imported.source.id === sourceId)) {
    console.log('Skipping already imported', sourceId);
  } else {
    const searchResults = await youtube.music.search(query, { type: 'song' })
    // console.dir(searchResults, { depth: 10 });

    const firstResult = searchResults.contents!.find((c) => c.type === 'MusicShelf')!.contents![0];
    assert(firstResult != null && firstResult instanceof YTNodes.MusicResponsiveListItem);
    //console.dir(firstItem, { depth: 10 });
    const { id } = firstResult;
    assert(id != null);
    const artist = firstResult.artists?.map((a) => a.name)?.join(', ') ?? 'Unknown Artist';
    const title = `${artist} - ${firstResult.title}`;
    console.log('Adding', query, '=>', title, `(${id})`);

    await pRetry(async () => {
      await youtube.playlist.addVideos(playlistId, [id])

      // todo there's a risk of adding twice
      importedDb.push({
        source: { id: sourceId, query },
        youtube: { id, title },
      });
      await writeFile(importedDbPath, JSON.stringify(importedDb, null, 2));
    }, {
      shouldRetry: (err) => {
        if (!(err instanceof Utils.InnertubeError)) return false
        const errInfo = JSON.parse(err.info)
        return errInfo.error.code === 409 || errInfo.error.code === 400 && /This functionality is not available right now. Please try again later/.test(errInfo.error.message)
      },
    });
  }

  // break;
}
