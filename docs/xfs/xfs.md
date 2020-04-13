# XFS文件系统结构

## 前言

XFS是一种优秀的文件系统，在未来的Centos和RHEL版本的Linux中，XFS将取代EXT4作为默认的文件系统。本文介绍了XFS文件系统的结构，主要通过xfs_db命令作为演示命令。演示环境使用的xfs版本是5.1.0，相比旧的版本来说，新版本xfs发生了不少变化，比如inode大小由之前的256字节扩充至512字节。这导致xfs文件系统结构上在新旧版本之前有了不少细节上的变化，不过差距依然不算太大。

本文主要针对当前版本进行描述。如果你使用的是旧版本，并且想了解其详细结构，可以使用本文中使用的方法进行分析即可。一个xfs文件系统的整体布局如下图所示：

![image-20200413111445333](https://zorrozou.github.io/docs/xfs/1.png)

后续我们以此讲解相关结构。

## 超级块和分配组

我们可以使用xfs_info命令查看一个xfs文件系统的superblock信息：

```
[root@localhost zorro]# xfs_info /dev/sdb1
meta-data=/dev/sdb1              isize=512    agcount=4, agsize=1310656 blks
         =                       sectsz=512   attr=2, projid32bit=1
         =                       crc=1        finobt=1, sparse=1, rmapbt=0
         =                       reflink=1
data     =                       bsize=4096   blocks=5242624, imaxpct=25
         =                       sunit=0      swidth=0 blks
naming   =version 2              bsize=4096   ascii-ci=0, ftype=1
log      =internal log           bsize=4096   blocks=2560, version=2
         =                       sectsz=512   sunit=0 blks, lazy-count=1
realtime =none                   extsz=4096   blocks=0, rtextents=0
```

superblock简称sb，我们可以看到现实的内容中包括很多当前文件系统的关键信息：

isize=512：一个inode占用空间的大小。

bsize=4096：一个block大小。由此可知当前文件系统中一个block可以存放8个inode。

agcount=4：ag是xfs文件系统的最初级组织结构，全称是allcation group。一个xfs文件系统是由若干个ag组成的。可以在格式化xfs的时候指定ag个数，默认一般是4个ag。

agsize=1310656：每个ag所包含的block块数。

sectsz=512：磁盘扇区大小。

finobt=1：自 Linux 3.16 起，XFS 增加了 B+树用于索引未被使用的 inode。这是这个开关是否打开的选项。1表示打开。

rmapbt=0：rmapbt功能关闭。

blocks=5242624：分区包含的所有block总数。

除了xfs_info以外，我们还可以使用xfs_db命令查看sb的内容：

```
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> sb
xfs_db> p
magicnum = 0x58465342
blocksize = 4096
dblocks = 5242624
rblocks = 0
rextents = 0
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
logstart = 4194310
rootino = 128
rbmino = 129
rsumino = 130
rextsize = 1
agblocks = 1310656
agcount = 4
rbmblocks = 0
logblocks = 2560
versionnum = 0xb4a5
sectsize = 512
inodesize = 512
inopblock = 8
fname = "\000\000\000\000\000\000\000\000\000\000\000\000"
blocklog = 12
sectlog = 9
inodelog = 9
inopblog = 3
agblklog = 21
rextslog = 0
inprogress = 0
imax_pct = 25
icount = 2432
ifree = 136
fdblocks = 5231961
frextents = 0
uquotino = null
gquotino = null
qflags = 0
flags = 0
shared_vn = 0
inoalignmt = 8
unit = 0
width = 0
dirblklog = 0
logsectlog = 0
logsectsize = 0
logsunit = 1
features2 = 0x18a
bad_features2 = 0x18a
features_compat = 0
features_ro_compat = 0x5
features_incompat = 0x3
features_log_incompat = 0
crc = 0x1fc6edb7 (correct)
spino_align = 4
pquotino = null
lsn = 0x100001281
meta_uuid = 00000000-0000-0000-0000-000000000000
```

这里看到的内容会更全面。这里我们还可以关注的其他重要属性包括：

rootino = 128：本文件系统第一个inode编号，一般这个inode就是这个文件系统的第一个目录对应的inode编号。

agblocks = 1310656：每个ag中的block个数。

icount = 2432：目前已经分配的inode个数。这里要注意的是，与ext3/4文件系统不同，xfs的inode是动态分配的，所以这里的个数会随着文件个数的变化而变化。

ifree = 136：已分配inode中还未使用的inode个数。

其他参数我们暂不挨个解释了，有兴趣的可以自行查询资料。sb结构体定义在内核源代码 fs/xfs/libxfs/xfs_format.h 文件中，内容如下：

```
/*
 * Superblock - on disk version.  Must match the in core version above.
 * Must be padded to 64 bit alignment.
 */
typedef struct xfs_dsb {
        __be32          sb_magicnum;    /* magic number == XFS_SB_MAGIC */
        __be32          sb_blocksize;   /* logical block size, bytes */
        __be64          sb_dblocks;     /* number of data blocks */
        __be64          sb_rblocks;     /* number of realtime blocks */
        __be64          sb_rextents;    /* number of realtime extents */
        uuid_t          sb_uuid;        /* user-visible file system unique id */
        __be64          sb_logstart;    /* starting block of log if internal */
        __be64          sb_rootino;     /* root inode number */
        __be64          sb_rbmino;      /* bitmap inode for realtime extents */
        __be64          sb_rsumino;     /* summary inode for rt bitmap */
        __be32          sb_rextsize;    /* realtime extent size, blocks */
        __be32          sb_agblocks;    /* size of an allocation group */
        __be32          sb_agcount;     /* number of allocation groups */
        __be32          sb_rbmblocks;   /* number of rt bitmap blocks */
        __be32          sb_logblocks;   /* number of log blocks */
        __be16          sb_versionnum;  /* header version == XFS_SB_VERSION */
        __be16          sb_sectsize;    /* volume sector size, bytes */
        __be16          sb_inodesize;   /* inode size, bytes */
        __be16          sb_inopblock;   /* inodes per block */
        char            sb_fname[XFSLABEL_MAX]; /* file system name */
        __u8            sb_blocklog;    /* log2 of sb_blocksize */
        __u8            sb_sectlog;     /* log2 of sb_sectsize */
        __u8            sb_inodelog;    /* log2 of sb_inodesize */
        __u8            sb_inopblog;    /* log2 of sb_inopblock */
        __u8            sb_agblklog;    /* log2 of sb_agblocks (rounded up) */
        __u8            sb_rextslog;    /* log2 of sb_rextents */
        __u8            sb_inprogress;  /* mkfs is in progress, don't mount */
        __u8            sb_imax_pct;    /* max % of fs for inode space */
                                        /* statistics */
        /*
         * These fields must remain contiguous.  If you really
         * want to change their layout, make sure you fix the
         * code in xfs_trans_apply_sb_deltas().
         */
        __be64          sb_icount;      /* allocated inodes */
        __be64          sb_ifree;       /* free inodes */
        __be64          sb_fdblocks;    /* free data blocks */
        __be64          sb_frextents;   /* free realtime extents */
        /*
         * End contiguous fields.
         */
        __be64          sb_uquotino;    /* user quota inode */
        __be64          sb_gquotino;    /* group quota inode */
        __be16          sb_qflags;      /* quota flags */
        __u8            sb_flags;       /* misc. flags */
        __u8            sb_shared_vn;   /* shared version number */
        __be32          sb_inoalignmt;  /* inode chunk alignment, fsblocks */
        __be32          sb_unit;        /* stripe or raid unit */
        __be32          sb_width;       /* stripe or raid width */
        __u8            sb_dirblklog;   /* log2 of dir block size (fsbs) */
        __u8            sb_logsectlog;  /* log2 of the log sector size */
        __be16          sb_logsectsize; /* sector size for the log, bytes */
        __be32          sb_logsunit;    /* stripe unit size for the log */
        __be32          sb_features2;   /* additional feature bits */
        /*
         * bad features2 field as a result of failing to pad the sb
         * structure to 64 bits. Some machines will be using this field
         * for features2 bits. Easiest just to mark it bad and not use
         * it for anything else.
         */
        __be32          sb_bad_features2;

        /* version 5 superblock fields start here */

        /* feature masks */
        __be32          sb_features_compat;
        __be32          sb_features_ro_compat;
        __be32          sb_features_incompat;
        __be32          sb_features_log_incompat;

        __le32          sb_crc;         /* superblock crc */
        __be32          sb_spino_align; /* sparse inode chunk alignment */

        __be64          sb_pquotino;    /* project quota inode */
        __be64          sb_lsn;         /* last write sequence */
        uuid_t          sb_meta_uuid;   /* metadata file system unique id */

        /* must be padded to 64 bit alignment */
} xfs_dsb_t;
```

sb信息会记录在文件系统的第一个ag中的第一个block内并且只使用了其头部512字节。使用xfs_db命令还可以这样查看其相关信息：

```
xfs_db> sb
xfs_db> addr
current
	byte offset 0, length 512
	buffer block 0 (fsbno 0), 1 bb
	inode 130, dir inode -1, type sb
	
xfs_db> fsblock 0
xfs_db> p
000: 58465342 00001000 00000000 004fff00 00000000 00000000 00000000 00000000
020: 20de1c54 1c5745ca a487de87 fc1d92e7 00000000 00400006 00000000 00000080
040: 00000000 00000081 00000000 00000082 00000001 0013ffc0 00000004 00000000
060: 00000a00 b4a50200 02000008 00000000 00000000 00000000 0c090903 15000019
080: 00000000 00000980 00000000 00000088 00000000 004fd559 00000000 00000000
0a0: ffffffff ffffffff ffffffff ffffffff 00000000 00000008 00000000 00000000
0c0: 00000000 00000001 0000018a 0000018a 00000000 00000005 00000003 00000000
0e0: 1fc6edb7 00000004 ffffffff ffffffff 00000001 00001281 00000000 00000000
......

xfs_db> type sb
xfs_db> p
magicnum = 0x58465342
blocksize = 4096
dblocks = 5242624
rblocks = 0
rextents = 0
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
logstart = 4194310
rootino = 128
rbmino = 129
rsumino = 130
rextsize = 1
agblocks = 1310656
agcount = 4
rbmblocks = 0
logblocks = 2560
versionnum = 0xb4a5
sectsize = 512
inodesize = 512
inopblock = 8
......
```

文件系统第一块除了sb占用前512字节外，后续还保存了其他相关本ag的重要数据结构信息，依次为：

agf：ag本身的头部信息。包含了本ag的很多block索引的相关重要信息，具体内容可在内核源代码中参考 xfs_agf_t 数据结构的定义。

agi：ag本身的头部信息。包含了本ag的很多inode索引的相关重要信息，具体内容可在内核源代码中参考 xfs_agi_t 数据结构的定义。

agfl：ag的freelist结构信息。具体可以参考内核源代码中的 xfs_agfl_t 结构体定义。

他们在磁盘中的布局用xfs_db显示如下：

```
xfs_db> agf 0
xfs_db> addr
current
	byte offset 512, length 512
	buffer block 1 (fsbno 0), 1 bb
	inode 130, dir inode -1, type agf
xfs_db> agi 0
xfs_db> addr
current
	byte offset 1024, length 512
	buffer block 2 (fsbno 0), 1 bb
	inode 130, dir inode -1, type agi
xfs_db> agfl 0
xfs_db> addr
current
	byte offset 1536, length 512
	buffer block 3 (fsbno 0), 1 bb
	inode 130, dir inode -1, type agfl
	
xfs_db> agf
xfs_db> p
magicnum = 0x58414746
versionnum = 1
seqno = 0
length = 1310656
bnoroot = 1
cntroot = 2
rmaproot =
refcntroot = 5
bnolevel = 1
cntlevel = 1
rmaplevel = 0
refcntlevel = 1
rmapblocks = 0
refcntblocks = 1
flfirst = 0
fllast = 3
flcount = 4
freeblks = 1310638
longest = 1310632
btreeblks = 0
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
lsn = 0x100001466
crc = 0x4c897b50 (correct)
xfs_db> agfl
xfs_db> p
magicnum = 0x5841464c
seqno = 0
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
lsn = 0xffffffffffffffff
crc = 0x2506ce2 (correct)
bno[0-118] = 0:6 1:7 2:8 3:9 4:null 5:null 6:null 7:null 8:null 9:null 10:null 11:null 12:null 13:null 14:null 15:null 16:null 17:null 18:null 19:null 20:null 21:null 22:null 23:null 24:null 25:null 26:null 27:null 28:null 29:null 30:null 31:null 32:null 33:null 34:null 35:null 36:null 37:null 38:null 39:null 40:null 41:null 42:null 43:null 44:null 45:null 46:null 47:null 48:null 49:null 50:null 51:null 52:null 53:null 54:null 55:null 56:null 57:null 58:null 59:null 60:null 61:null 62:null 63:null 64:null 65:null 66:null 67:null 68:null 69:null 70:null 71:null 72:null 73:null 74:null 75:null 76:null 77:null 78:null 79:null 80:null 81:null 82:null 83:null 84:null 85:null 86:null 87:null 88:null 89:null 90:null 91:null 92:null 93:null 94:null 95:null 96:null 97:null 98:null 99:null 100:null 101:null 102:null 103:null 104:null 105:null 106:null 107:null 108:null 109:null 110:null 111:null 112:null 113:null 114:null 115:null 116:null 117:null 118:null
```

每一组ag的第一块中都包含sb，agf，agi，agfl四个结构，每个结构占用512字节。不同的是除了第一个ag的sb以外，其他的sb都用作备份。其他的ag中的agf、agi和agfl都记录各自的索引信息。这里我们需要着重介绍的是agi结构，它负责管理已分配的inode索引关系。在介绍它之前，我们先把其余结构说完。第一块的后2048字节是未被占用的，然后是第二块和第三块：

```
xfs_db> fsblock 1
xfs_db> type text
xfs_db> p
000:  41 42 33 42 00 00 00 01 ff ff ff ff ff ff ff ff  AB3B............
010:  00 00 00 00 00 00 00 08 00 00 00 01 00 00 0c b1  ................
020:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
030:  00 00 00 00 5f 74 d7 a4 00 00 16 09 00 13 e9 b7  .....t..........
040:  00 00 00 a6 00 13 ff 1a 00 00 00 99 00 13 ff 27  ................
050:  00 00 00 99 00 13 ff 27 00 00 00 99 00 13 ff 27  ................
060:  00 00 00 99 00 13 ff 27 00 00 03 df 00 13 fb e1  ................
070:  00 0d fe ab 00 06 01 15 00 0d fe ab 00 06 01 15  ................
080:  00 0d fe ab 00 06 01 15 00 0d fe ab 00 06 01 15  ................
090:  00 0d fe ab 00 06 01 15 00 0d fe ab 00 06 01 15  ................
0a0:  00 0d fe ab 00 06 01 15 00 0d fe ab 00 06 01 15  ................
0b0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
......
xfs_db> fsblock 2
xfs_db> type text
xfs_db> p
000:  41 42 33 43 00 00 00 02 ff ff ff ff ff ff ff ff  AB3C............
010:  00 00 00 00 00 00 00 10 00 00 00 01 00 00 14 66  ...............f
020:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
030:  00 00 00 00 56 f6 b4 f3 00 00 00 0a 00 00 00 06  ....V...........
040:  00 00 00 18 00 13 ff a8 00 00 00 88 00 13 ff 38  ...............8
050:  00 00 16 09 00 13 e9 b7 00 00 16 09 00 13 e9 b7  ................
060:  00 00 16 09 00 13 e9 b7 00 00 16 09 00 13 e9 b7  ................
070:  00 00 16 09 00 13 e9 b7 00 00 16 09 00 13 e9 b7  ................
080:  00 00 03 df 00 0d f3 7e 00 00 03 df 00 0d f3 7e  ................
090:  00 00 03 df 00 0d f3 7e 00 00 03 df 00 0d f3 7e  ................
0a0:  00 00 03 df 00 0d f3 7e 00 00 03 df 00 0d f3 7e  ................
0b0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0c0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
......
```

这两块分别存放的是abtb和abtc树，本质上就是agf中管理的 free block 的索引tree。用来在分配block的时候加快寻找 free block 的速度。这部分并不是我们要讲的重点内容，有兴趣的同学可以自己研究一下。我们重点要讲的是inode的索引结构。

## inode的分配与管理

xfs是通过agi和其相关btree结构对inode进行管理的，我们先来查看一下agi的内容：

```
xfs_db> agi 0
xfs_db> p
magicnum = 0x58414749
versionnum = 1
seqno = 0
length = 1310656
count = 896
root = 3
level = 1
freecount = 25
newino = 1024
dirino = null
unlinked[0-63] =
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
crc = 0x3a15991e (correct)
lsn = 0x100000cb1
free_root = 4
free_level = 1
xfs_db> type text
xfs_db> p
000:  58 41 47 49 00 00 00 01 00 00 00 00 00 13 ff c0  XAGI............
010:  00 00 03 80 00 00 00 03 00 00 00 01 00 00 00 19  ................
020:  00 00 04 00 ff ff ff ff ff ff ff ff ff ff ff ff  ................
030:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
040:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
050:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
060:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
070:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
080:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
090:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
0a0:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
0b0:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
0c0:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
0d0:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
0e0:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
0f0:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
100:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
110:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  ................
120:  ff ff ff ff ff ff ff ff 20 de 1c 54 1c 57 45 ca  ...........T.WE.
130:  a4 87 de 87 fc 1d 92 e7 3a 15 99 1e 00 00 00 00  ................
140:  00 00 00 01 00 00 0c b1 00 00 00 04 00 00 00 01  ................
150:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
......
```

内核中相关结构体定义在 fs/xfs/libxfs/xfs_format.h 文件中，内容如下：

```
typedef struct xfs_agi {
        /*
         * Common allocation group header information
         */
        __be32          agi_magicnum;   /* magic number == XFS_AGI_MAGIC */
        __be32          agi_versionnum; /* header version == XFS_AGI_VERSION */
        __be32          agi_seqno;      /* sequence # starting from 0 */
        __be32          agi_length;     /* size in blocks of a.g. */
        /*
         * Inode information
         * Inodes are mapped by interpreting the inode number, so no
         * mapping data is needed here.
         */
        __be32          agi_count;      /* count of allocated inodes */
        __be32          agi_root;       /* root of inode btree */
        __be32          agi_level;      /* levels in inode btree */
        __be32          agi_freecount;  /* number of free inodes */

        __be32          agi_newino;     /* new inode just allocated */
        __be32          agi_dirino;     /* last directory inode chunk */
        /*
         * Hash table of inodes which have been unlinked but are
         * still being referenced.
         */
        __be32          agi_unlinked[XFS_AGI_UNLINKED_BUCKETS];
        /*
         * This marks the end of logging region 1 and start of logging region 2.
         */
        uuid_t          agi_uuid;       /* uuid of filesystem */
        __be32          agi_crc;        /* crc of agi sector */
        __be32          agi_pad32;
        __be64          agi_lsn;        /* last write sequence */

        __be32          agi_free_root; /* root of the free inode btree */
        __be32          agi_free_level;/* levels in free inode btree */

        /* structure must be padded to 64 bit alignment */
} xfs_agi_t;
```

我们主要关注的数据包括：

agi_count：在本agi中已分配的inode个数。

agi_root：本ag用来索引inode的btree所在block编号。

agi_level：btree存储层级。

agi_freecount：本ag内还剩几个inode未被占用。

根据agi_root信息我们知道，本ag对应的inode索引树在block 3上。我们可以用两种方法查看其内容：

```
xfs_db> agi 0
xfs_db> addr root
xfs_db> p
magic = 0x49414233
level = 0
numrecs = 14
leftsib = null
rightsib = null
bno = 24
lsn = 0x100000cb1
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
owner = 0
crc = 0x25199987 (correct)
recs[1-14] = [startino,holemask,count,freecount,free]
1:[128,0,64,0,0]
2:[192,0,64,0,0]
3:[256,0,64,0,0]
4:[320,0,64,0,0]
5:[448,0,64,0,0]
6:[512,0,64,0,0]
7:[640,0,64,0,0]
8:[704,0,64,0,0]
9:[768,0,64,0,0]
10:[832,0,64,0,0]
11:[960,0,64,0,0]
12:[1024,0,64,25,0xffffff8000000000]
13:[1088,0,64,0,0]
14:[1152,0,64,0,0]

xfs_db> fsblock 3
xfs_db> type inobt
xfs_db> p
magic = 0x49414233
level = 0
numrecs = 14
leftsib = null
rightsib = null
bno = 24
lsn = 0x100000cb1
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
owner = 0
crc = 0x25199987 (correct)
recs[1-14] = [startino,holemask,count,freecount,free]
1:[128,0,64,0,0]
2:[192,0,64,0,0]
3:[256,0,64,0,0]
4:[320,0,64,0,0]
5:[448,0,64,0,0]
6:[512,0,64,0,0]
7:[640,0,64,0,0]
8:[704,0,64,0,0]
9:[768,0,64,0,0]
10:[832,0,64,0,0]
11:[960,0,64,0,0]
12:[1024,0,64,25,0xffffff8000000000]
13:[1088,0,64,0,0]
14:[1152,0,64,0,0]
```

第一种方法是通过定位agi的root地址，打印出相关信息。第二种是直接查看对应块的内容。我们还可以打印出其text格式内容来查看一下相关值：

```
xfs_db> type text
xfs_db> p
000:  49 41 42 33 00 00 00 0e ff ff ff ff ff ff ff ff  IAB3............
010:  00 00 00 00 00 00 00 18 00 00 00 01 00 00 0c b1  ................
020:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
030:  00 00 00 00 25 19 99 87 00 00 00 80 00 00 40 00  ................
040:  00 00 00 00 00 00 00 00 00 00 00 c0 00 00 40 00  ................
050:  00 00 00 00 00 00 00 00 00 00 01 00 00 00 40 00  ................
060:  00 00 00 00 00 00 00 00 00 00 01 40 00 00 40 00  ................
070:  00 00 00 00 00 00 00 00 00 00 01 c0 00 00 40 00  ................
080:  00 00 00 00 00 00 00 00 00 00 02 00 00 00 40 00  ................
090:  00 00 00 00 00 00 00 00 00 00 02 80 00 00 40 00  ................
0a0:  00 00 00 00 00 00 00 00 00 00 02 c0 00 00 40 00  ................
0b0:  00 00 00 00 00 00 00 00 00 00 03 00 00 00 40 00  ................
0c0:  00 00 00 00 00 00 00 00 00 00 03 40 00 00 40 00  ................
0d0:  00 00 00 00 00 00 00 00 00 00 03 c0 00 00 40 00  ................
0e0:  00 00 00 00 00 00 00 00 00 00 04 00 00 00 40 19  ................
0f0:  ff ff ff 80 00 00 00 00 00 00 04 40 00 00 40 00  ................
100:  00 00 00 00 00 00 00 00 00 00 04 80 00 00 40 00  ................
110:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
......
```

magic为IAB3的就是inobt的索引结构。其头结构定义为xfs_btree_block，在 fs/xfs/libxfs/xfs_format.h 中定义：

```
struct xfs_btree_block {
        __be32          bb_magic;       /* magic number for block type */
        __be16          bb_level;       /* 0 is a leaf */
        __be16          bb_numrecs;     /* current # of data records */
        union {
                struct xfs_btree_block_shdr s;
                struct xfs_btree_block_lhdr l;
        } bb_u;                         /* rest */
};
```

之后就是管理inode节点的xfs_inobt_rec_t结构：

```
/*
 * The on-disk inode record structure has two formats. The original "full"
 * format uses a 4-byte freecount. The "sparse" format uses a 1-byte freecount
 * and replaces the 3 high-order freecount bytes wth the holemask and inode
 * count.
 *
 * The holemask of the sparse record format allows an inode chunk to have holes
 * that refer to blocks not owned by the inode record. This facilitates inode
 * allocation in the event of severe free space fragmentation.
 */
typedef struct xfs_inobt_rec {
        __be32          ir_startino;    /* starting inode number */
        union {
                struct {
                        __be32  ir_freecount;   /* count of free inodes */
                } f;
                struct {
                        __be16  ir_holemask;/* hole mask for sparse chunks */
                        __u8    ir_count;       /* total inode count */
                        __u8    ir_freecount;   /* count of free inodes */
                } sp;
        } ir_u;
        __be64          ir_free;        /* free inode mask */
} xfs_inobt_rec_t;

typedef struct xfs_inobt_rec_incore {
        xfs_agino_t     ir_startino;    /* starting inode number */
        uint16_t        ir_holemask;    /* hole mask for sparse chunks */
        uint8_t         ir_count;       /* total inode count */
        uint8_t         ir_freecount;   /* count of free inodes (set bits) */
        xfs_inofree_t   ir_free;        /* free inode mask */
} xfs_inobt_rec_incore_t;
```

从以上内容中分析block的文本信息为，从030行的第九字节到040行的第8字节为第1个 xfs_inobt_rec_t 的存储位置，内容分析为：

00 00 00 80 ：ir_startino，128，表示起始inode编号。

00 00 ：ir_holemask。占用四字节的前两个个字节。用mask掩码方式表示分配的对应chunk哪部分未分配给inode。一个bit表示4个inode，16个bit可表示64个inode。

40 ：ir_count。占用第三个字节。表示该chunk中inode的总数。

00 ：ir_freecount。占用第四个字节。表示该chunk中的剩余inode个数。

00 00 00 00 00 00 00 00 ：ir_free。free inode mask。掩码（位图）方式表示64个inode的使用情况。

后续行数以此类推，得到内容显示中的：

recs[1-14] = [startino,holemask,count,freecount,free]
1:[128,0,64,0,0]
2:[192,0,64,0,0]
3:[256,0,64,0,0]
4:[320,0,64,0,0]
5:[448,0,64,0,0]
6:[512,0,64,0,0]
7:[640,0,64,0,0]
8:[704,0,64,0,0]
9:[768,0,64,0,0]
10:[832,0,64,0,0]
11:[960,0,64,0,0]
12:[1024,0,64,25,0xffffff8000000000]
13:[1088,0,64,0,0]
14:[1152,0,64,0,0]

首先我们要理解xfs分配inode编号的逻辑：inode编号本身就是inode所在的block位置。即：128号inode就是放在第16块上的第一个inode。因为每个block可以分配8个inode（当前文件系统inode大小为512），所以inode所在block编号就是128/8。上面每个xfs_inobt_rec_t表示一个 inode chunk 的信息记录。xfs在分配inode的时候，是以chunk为单位进行分配的，一次分配64个inode，为一个chunk。就是说在当前文件系统中，每次会分配连续8个block存放inode。于是我们可以推算出对应编号的inode何其分配的block空间对应位置，我们用其中一行举例。比如：

12:[1024,0,64,25,0xffffff8000000000]

startino为1024，可以推算出其inode存储的block编号为1024/8 = 128，就是说从block编号为128之后连续8个block都会存放inode，共64个inode。

holemask用掩码的方式表示这个对应的chunk中哪些位置不能分配给inode，掩码为0表示所有chunk空间都可以存放inode。假定这里为0x00ff，表示掩码中低端8位全部为1，对应的表示64个inode中，后32个inode不能使用，只能使用前32个。每个掩码可以管理对应位置的4个inode。

count就是这个chunk管理的inode个数。

freecount还剩25个inode空闲。

free为空闲inode的掩码（位图），0xffffff8000000000表示64位中前39位为1，就是说前39个inode已经被使用了，还剩后25个可以使用。

我们再来看一下agi 1的root inobt相关信息：

```
xfs_db> agi 1
xfs_db> addr root
xfs_db> p
magic = 0x49414233
level = 0
numrecs = 8
leftsib = null
rightsib = null
bno = 10485272
lsn = 0x100000cb1
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
owner = 1
crc = 0xf6068ff4 (correct)
recs[1-8] = [startino,holemask,count,freecount,free]
1:[128,0,64,0,0]
2:[192,0,64,0,0]
3:[256,0,64,0,0]
4:[384,0,64,0,0]
5:[448,0,64,0,0]
6:[512,0,64,61,0xfffffffffffffff8]
7:[768,0,64,0,0]
8:[832,0,64,0,0]
```

我们发现，这里对应的startino编号跟agi 0里面的重复了，就是说如果还用agi 0的方法推算inode编号的话，将会产生重复的inode编号。这里要说明的是，对于整个文件系统来说，inode编号的推算不仅仅是推算block在本ag中的对应偏移。我们来看一下inode编码是怎么产生的，这在内核中有说明：

```
/*
 * Inode number format:
 * low inopblog bits - offset in block
 * next agblklog bits - block number in ag
 * next agno_log bits - ag number
 * high agno_log-agblklog-inopblog bits - 0
 */
```

以上的各个变量含义为：

最低位：

inopblog：inopb为每个block中可以存放inode的个数，在当前文件系统上为8，对这个数取其以2为底的对数即：inopblog = log2(8) = 3。这部分用来记录当前inode相对本block中的编号。

之后：

agblklog：agblk为每个ag中block的个数，在当前文件系统中为1310656，对这个数取其以2为底的对数即：agblocklog = log2(1310656) = 21。这部分用来记录当前inode所在block相对本ag中的block编号。

再之后：

agno_log：agno为文件系统ag的个数，在当前文件系统中为4，对这个数取其以2为底的对数即：agno_log = log2(4) = 2。这部分用来记录当前inode所在ag的编号。

整体布局由高到低为：

agno_log + agblklog + inopblog

由此我们可以估算 agi 1 的第一个inode编号的二进制表达为：1000000000000000010000000。算出10进制为：16777344。其他各个ag中的inode算法以此类推。

## 文件删除后的inobt特征

我们已知第4个 block 是 ag 0 的 inobt所在块，我们来观察一下文件删除前后的这块内容变化：

删除前：

```
xfs_db> fsblock 3
xfs_db> type inobt
xfs_db> p
magic = 0x49414233
level = 0
numrecs = 14
leftsib = null
rightsib = null
bno = 24
lsn = 0x100000cb1
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
owner = 0
crc = 0x25199987 (correct)
recs[1-14] = [startino,holemask,count,freecount,free]
1:[128,0,64,0,0]
2:[192,0,64,0,0]
3:[256,0,64,0,0]
4:[320,0,64,0,0]
5:[448,0,64,0,0]
6:[512,0,64,0,0]
7:[640,0,64,0,0]
8:[704,0,64,0,0]
9:[768,0,64,0,0]
10:[832,0,64,0,0]
11:[960,0,64,0,0]
12:[1024,0,64,25,0xffffff8000000000]
13:[1088,0,64,0,0]
14:[1152,0,64,0,0]
xfs_db> type text
xfs_db> p
000:  49 41 42 33 00 00 00 0e ff ff ff ff ff ff ff ff  IAB3............
010:  00 00 00 00 00 00 00 18 00 00 00 01 00 00 0c b1  ................
020:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
030:  00 00 00 00 25 19 99 87 00 00 00 80 00 00 40 00  ................
040:  00 00 00 00 00 00 00 00 00 00 00 c0 00 00 40 00  ................
050:  00 00 00 00 00 00 00 00 00 00 01 00 00 00 40 00  ................
060:  00 00 00 00 00 00 00 00 00 00 01 40 00 00 40 00  ................
070:  00 00 00 00 00 00 00 00 00 00 01 c0 00 00 40 00  ................
080:  00 00 00 00 00 00 00 00 00 00 02 00 00 00 40 00  ................
090:  00 00 00 00 00 00 00 00 00 00 02 80 00 00 40 00  ................
0a0:  00 00 00 00 00 00 00 00 00 00 02 c0 00 00 40 00  ................
0b0:  00 00 00 00 00 00 00 00 00 00 03 00 00 00 40 00  ................
0c0:  00 00 00 00 00 00 00 00 00 00 03 40 00 00 40 00  ................
0d0:  00 00 00 00 00 00 00 00 00 00 03 c0 00 00 40 00  ................
0e0:  00 00 00 00 00 00 00 00 00 00 04 00 00 00 40 19  ................
0f0:  ff ff ff 80 00 00 00 00 00 00 04 40 00 00 40 00  ................
100:  00 00 00 00 00 00 00 00 00 00 04 80 00 00 40 00  ................
110:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
```

删除后：

```
[root@localhost xfsprogs-5.1.0]# mount /dev/sdb1 /mnt
[root@localhost xfsprogs-5.1.0]# rm -rf /mnt/*
[root@localhost xfsprogs-5.1.0]# umount /mnt
[root@localhost xfsprogs-5.1.0]# xfs_db /dev/sdb1
xfs_db> fsblock 3
xfs_db> type inobt
xfs_db> p
magic = 0x49414233
level = 0
numrecs = 1
leftsib = null
rightsib = null
bno = 24
lsn = 0x100001466
uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
owner = 0
crc = 0x7fc5210b (correct)
recs[1] = [startino,holemask,count,freecount,free]
1:[128,0,64,61,0xfffffffffffffff8]
xfs_db> type text
xfs_db> p
000:  49 41 42 33 00 00 00 01 ff ff ff ff ff ff ff ff  IAB3............
010:  00 00 00 00 00 00 00 18 00 00 00 01 00 00 14 66  ...............f
020:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
030:  00 00 00 00 7f c5 21 0b 00 00 00 80 00 00 40 3d  ................
040:  ff ff ff ff ff ff ff f8 00 00 04 00 00 00 40 3f  ................
050:  ff ff ff bf ff ff ff ff 00 00 04 00 00 00 40 1b  ................
060:  ff ff ff 80 00 00 00 03 00 00 04 00 00 00 40 19  ................
070:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
080:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
090:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
0a0:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
0b0:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
0c0:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
0d0:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
0e0:  ff ff ff 80 00 00 00 00 00 00 04 00 00 00 40 19  ................
0f0:  ff ff ff 80 00 00 00 00 00 00 04 80 00 00 40 3f  ................
100:  ff ff ff ff fb ff ff ff 00 00 04 80 00 00 40 01  ................
```

我们发现文件删除后，对应的inobt内容全部会清空。所以对于xfs文件系统来说，无法从inode的索引结构恢复文件系统整体信息。对全盘进行block扫描是唯一的方法。

## xfs目录项结构

在一个xfs文件系统上创建一个目录，并在其中创建文件若干。随机删除部分文件之后，查看目录内容：

```
mount /dev/sdb1 /mnt

mount |grep xfs
/dev/sdb1 on /mnt type xfs (rw,relatime,attr2,inode64,logbufs=8,logbsize=32k,noquota)

ls -li /mnt/testdir/
total 8840
 474 -rw-r--r-- 1 root root 692241 Mar 10 14:54 1
1046 -rw-r--r-- 1 root root 692241 Mar 10 14:56 10
1047 -rw-r--r-- 1 root root 692241 Mar 10 14:56 11
 475 -rw-r--r-- 1 root root 692241 Mar 10 14:54 2
 500 -rw-r--r-- 1 root root 692241 Mar 10 14:54 3
 597 -rw-r--r-- 1 root root 692241 Mar 10 14:55 4
1005 -rw-r--r-- 1 root root 692241 Mar 10 14:55 5
1040 -rw-r--r-- 1 root root 692241 Mar 10 14:55 6
1041 -rw-r--r-- 1 root root 692241 Mar 10 14:55 7
1042 -rw-r--r-- 1 root root 692241 Mar 10 14:55 8
1045 -rw-r--r-- 1 root root 692241 Mar 10 14:55 9
1044 -rw-r--r-- 1 root root 692241 Mar 10 14:55 sdljfglkajflkdsjafuiawehfkjhdsakjfweupihfkdjshflkjsdhfowhjfkdsajhfaksldhfkjdsahfkjldshflkjsdafkljashfoweifhosdhfkjasdhfsdajfksdajhfsdbfiwuehfbfiawuyfbsfalkashfopweyfahsfoasfopsadhfjasfghiuyfoihasdfojsadfopjsadfds
1039 -rw-r--r-- 1 root root 692241 Mar 10 14:55 skdaljflksdjflkdsjflkdsjflksdjfkljdslkfjdsklfjdslkfjsdlkafldskjflksadjflksdaj
```



本目录inode编号：

```
[root@localhost zorro]# ls -ldi /mnt/testdir/
132 drwxr-xr-x 2 root root 4096 Mar 10 14:58 /mnt/testdir/
```



使用xfd_db，查看相关信息：

```
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 132
xfs_db> p
core.magic = 0x494e
core.mode = 040755
core.version = 3
core.format = 2 (extents)
core.nlinkv2 = 2
core.onlink = 0
core.projid_lo = 0
core.projid_hi = 0
core.uid = 0
core.gid = 0
core.flushiter = 0
core.atime.sec = Wed Mar 11 09:29:19 2020
core.atime.nsec = 080267517
core.mtime.sec = Tue Mar 10 14:58:56 2020
core.mtime.nsec = 713882050
core.ctime.sec = Tue Mar 10 14:58:56 2020
core.ctime.nsec = 713882050
core.size = 4096
core.nblocks = 1
core.extsize = 0
core.nextents = 1
core.naextents = 0
core.forkoff = 0
core.aformat = 2 (extents)
core.dmevmask = 0
core.dmstate = 0
core.newrtbm = 0
core.prealloc = 0
core.realtime = 0
core.immutable = 0
core.append = 0
core.sync = 0
core.noatime = 0
core.nodump = 0
core.rtinherit = 0
core.projinherit = 0
core.nosymlinks = 0
core.extsz = 0
core.extszinherit = 0
core.nodefrag = 0
core.filestream = 0
core.gen = 2835759035
next_unlinked = null
v3.crc = 0x3c6ef0dd (correct)
v3.change_count = 21
v3.lsn = 0x1000006c3
v3.flags2 = 0
v3.cowextsize = 0
v3.crtime.sec = Tue Mar 10 14:54:02 2020
v3.crtime.nsec = 873293298
v3.inumber = 132
v3.uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
v3.reflink = 0
v3.cowextsz = 0
u3.bmx[0] = [startoff,startblock,blockcount,extentflag]
0:[0,11,1,0]
```



core.format = 2 (extents)，说明此目录使用extents方式存放目录项信息，对应索引到的extent为：

u3.bmx[0] = [startoff,startblock,blockcount,extentflag]

0:[0,11,1,0]

中括号内四个数字含义：

startoff：索引文件逻辑起始块偏移量

startblock：文件逻辑偏移量对应的磁盘物理起始块

blockcout：连续块个数

extentflag：extent标志

以此可知，此目录索引了1个block，对应磁盘的物理block编号为11号。

core.format对应目录有三种可能的存放方法，extent为直接索引block。另外还包括：

local：目录项直接存放在本inode信息内，如果目录项内容不多的时候采用这种形式。目录项内容会存放在inode结构之后的位置。

btree：目录项内容很多，采用btree方式分层级间接索引相关block。

以上两种结构我们后续再分析。

已知目前目录项对应block编号，使用xfs_db查看对应block信息：

```
xfs_db> fsblock 11
xfs_db> p
000: 58444233 dda1a62c 00000000 00000058 00000001 000006b8 20de1c54 1c5745ca
020: a487de87 fc1d92e7 00000000 00000084 03280c48 006000c0 02000018 00000000
040: 00000000 00000084 012e0200 00000040 00000000 00000080 022e2e02 00000050
060: ffff00c0 000001d9 b2616161 61616161 61616161 61616161 61616161 61616161
080: 61616161 61616161 61616161 61616161 61616161 61616161 61616161 61616161
0a0: 61616161 61616161 61616161 61616161 61616161 61616161 61616161 61616161
0c0: 61616161 61616161 61616161 61616161 61616161 61616161 61616161 61616161
0e0: 61616161 61616161 61616161 61616161 61616161 61616161 61616161 61616161
100: 61616161 61616161 61616161 61616161 61616161 61616161 61616101 00000060
120: 00000000 000001da 01310100 00000120 00000000 000001db 01320100 00000130
......
```



使用fsblock可以定位到相关block，然后可以用print（p）命令打印内容。这样直接打印出的内容不方便查看，可以用type命令定义输出格式内容来查看。

```
xfs_db> type
current type is "data"

 supported types are:
 agf, agfl, agi, attr3, bmapbta, bmapbtd, bnobt, cntbt,
 rmapbt, refcntbt, data, dir3, dqblk, inobt, inodata, inode,
 log, rtbitmap, rtsummary, sb, symlink, text, finobt
```



对于目录项内容，我们可以用dir3查看，也可以用text方式直接以文本方式显示查看：

```
xfs_db> type dir3
xfs_db> p
bhdr.hdr.magic = 0x58444233
bhdr.hdr.crc = 0xdda1a62c (correct)
bhdr.hdr.bno = 88
bhdr.hdr.lsn = 0x1000006b8
bhdr.hdr.uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
bhdr.hdr.owner = 132
bhdr.bestfree[0].offset = 0x328
bhdr.bestfree[0].length = 0xc48
bhdr.bestfree[1].offset = 0x60
bhdr.bestfree[1].length = 0xc0
bhdr.bestfree[2].offset = 0x200
bhdr.bestfree[2].length = 0x18
bu[0].inumber = 132
bu[0].namelen = 1
bu[0].name = "."
bu[0].filetype = 2
bu[0].tag = 0x40
bu[1].inumber = 128
bu[1].namelen = 2
bu[1].name = ".."
bu[1].filetype = 2
bu[1].tag = 0x50
bu[2].freetag = 0xffff
bu[2].length = 0xc0
bu[2].filetype = 0
bu[2].tag = 0x60
bu[3].inumber = 474
bu[3].namelen = 1
bu[3].name = "1"
bu[3].filetype = 1
bu[3].tag = 0x120
```



```
xfs_db> type text
xfs_db> p
000:  58 44 42 33 dd a1 a6 2c 00 00 00 00 00 00 00 58  XDB3...........X
010:  00 00 00 01 00 00 06 b8 20 de 1c 54 1c 57 45 ca  ...........T.WE.
020:  a4 87 de 87 fc 1d 92 e7 00 00 00 00 00 00 00 84  ................
030:  03 28 0c 48 00 60 00 c0 02 00 00 18 00 00 00 00  ...H............
040:  00 00 00 00 00 00 00 84 01 2e 02 00 00 00 00 40  ................
050:  00 00 00 00 00 00 00 80 02 2e 2e 02 00 00 00 50  ...............P
060:  ff ff 00 c0 00 00 01 d9 b2 61 61 61 61 61 61 61  .........aaaaaaa
070:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
080:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
090:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
0a0:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
0b0:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
0c0:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
0d0:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
0e0:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
0f0:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
100:  61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 61  aaaaaaaaaaaaaaaa
110:  61 61 61 61 61 61 61 61 61 61 61 01 00 00 00 60  aaaaaaaaaaa.....
120:  00 00 00 00 00 00 01 da 01 31 01 00 00 00 01 20  .........1......
130:  00 00 00 00 00 00 01 db 01 32 01 00 00 00 01 30  .........2.....0
140:  00 00 00 00 00 00 01 f4 01 33 01 00 00 00 01 40  .........3......
150:  00 00 00 00 00 00 02 55 01 34 01 00 00 00 01 50  .......U.4.....P
160:  00 00 00 00 00 00 03 ed 01 35 01 00 00 00 01 60  .........5......
170:  00 00 00 00 00 00 04 0f 4d 73 6b 64 61 6c 6a 66  ........Mskdaljf
180:  6c 6b 73 64 6a 66 6c 6b 64 73 6a 66 6c 6b 64 73  lksdjflkdsjflkds
190:  6a 66 6c 6b 73 64 6a 66 6b 6c 6a 64 73 6c 6b 66  jflksdjfkljdslkf
1a0:  6a 64 73 6b 6c 66 6a 64 73 6c 6b 66 6a 73 64 6c  jdsklfjdslkfjsdl
1b0:  6b 61 66 6c 64 73 6b 6a 66 6c 6b 73 61 64 6a 66  kafldskjflksadjf
1c0:  6c 6b 73 64 61 6a 01 00 00 00 00 00 00 00 01 70  lksdaj.........p
1d0:  00 00 00 00 00 00 04 10 01 36 01 00 00 00 01 d0  .........6......
1e0:  00 00 00 00 00 00 04 11 01 37 01 00 00 00 01 e0  .........7......
1f0:  00 00 00 00 00 00 04 12 01 38 01 00 00 00 01 f0  .........8......
200:  ff ff 00 18 00 00 04 13 0c 65 72 69 74 75 6a 69  .........erituji
210:  6f 65 72 75 6e 01 02 00 00 00 00 00 00 00 04 14  oerun...........
220:  d4 73 64 6c 6a 66 67 6c 6b 61 6a 66 6c 6b 64 73  .sdljfglkajflkds
230:  6a 61 66 75 69 61 77 65 68 66 6b 6a 68 64 73 61  jafuiawehfkjhdsa
240:  6b 6a 66 77 65 75 70 69 68 66 6b 64 6a 73 68 66  kjfweupihfkdjshf
250:  6c 6b 6a 73 64 68 66 6f 77 68 6a 66 6b 64 73 61  lkjsdhfowhjfkdsa
260:  6a 68 66 61 6b 73 6c 64 68 66 6b 6a 64 73 61 68  jhfaksldhfkjdsah
270:  66 6b 6a 6c 64 73 68 66 6c 6b 6a 73 64 61 66 6b  fkjldshflkjsdafk
280:  6c 6a 61 73 68 66 6f 77 65 69 66 68 6f 73 64 68  ljashfoweifhosdh
290:  66 6b 6a 61 73 64 68 66 73 64 61 6a 66 6b 73 64  fkjasdhfsdajfksd
2a0:  61 6a 68 66 73 64 62 66 69 77 75 65 68 66 62 66  ajhfsdbfiwuehfbf
2b0:  69 61 77 75 79 66 62 73 66 61 6c 6b 61 73 68 66  iawuyfbsfalkashf
2c0:  6f 70 77 65 79 66 61 68 73 66 6f 61 73 66 6f 70  opweyfahsfoasfop
2d0:  73 61 64 68 66 6a 61 73 66 67 68 69 75 79 66 6f  sadhfjasfghiuyfo
2e0:  69 68 61 73 64 66 6f 6a 73 61 64 66 6f 70 6a 73  ihasdfojsadfopjs
2f0:  61 64 66 64 73 01 02 18 00 00 00 00 00 00 04 15  adfds...........
300:  01 39 01 00 00 00 02 f8 00 00 00 00 00 00 04 16  .9..............
310:  02 31 30 01 00 00 03 08 00 00 00 00 00 00 04 17  .10.............
320:  02 31 31 01 00 00 03 18 ff ff 0c 48 00 00 00 00  .11........H....
```



我们可以看到在目录项的内容，包含目录块的头信息和每个文件目录项的内容。通过对比，我们可以发现，text方式查看目录内容中包含部分文件名在实际目录中不存在，在dir3格式查看的时候也看不到，这部分文件就是我们删除的文件。我们发现，文件名在删除之后，文件名及部分信息并不会被清除，只会标记几个相关标志位。

下面我们来具体分析一下目录block结构，在内核xfs对应代码的头文件 fs/xfs/libxfs/xfs_da_format.h 中有如下注释：

```
/*
 * Data block structures.
 *
 * A pure data block looks like the following drawing on disk:
 *
 *    +-------------------------------------------------+
 *    | xfs_dir2_data_hdr_t                             |
 *    +-------------------------------------------------+
 *    | xfs_dir2_data_entry_t OR xfs_dir2_data_unused_t |
 *    | xfs_dir2_data_entry_t OR xfs_dir2_data_unused_t |
 *    | xfs_dir2_data_entry_t OR xfs_dir2_data_unused_t |
 *    | ...                                             |
 *    +-------------------------------------------------+
 *    | unused space                                    |
 *    +-------------------------------------------------+
 *
 * As all the entries are variable size structures the accessors below should
 * be used to iterate over them.
 *
 * In addition to the pure data blocks for the data and node formats,
 * most structures are also used for the combined data/freespace "block"
 * format below.
 */
```



由此我们大概可以了解一个目录块的相关数据结构包括：xfs_dir2_data_hdr_t 、xfs_dir2_data_entry_t和xfs_dir2_data_unused_t 。

查看text内容的块前4个字节是magic，对应值为：58 44 42 33（XDB3），由内核宏定义可知：

```
#define XFS_DIR3_BLOCK_MAGIC    0x58444233      /* XDB3: single block dirs */
#define XFS_DIR3_DATA_MAGIC     0x58444433      /* XDD3: multiblock dirs */
#define XFS_DIR3_FREE_MAGIC     0x58444633      /* XDF3: free index blocks */
```



这是一个XFS_DIR3_BLOCK_MAGIC格式块。

xfs_dir3_data_hdr结构定义如下：

```
/*
 * define a structure for all the verification fields we are adding to the
 * directory block structures. This will be used in several structures.
 * The magic number must be the first entry to align with all the dir2
 * structures so we determine how to decode them just by the magic number.
 */
struct xfs_dir3_blk_hdr {
        __be32                  magic;  /* magic number */
        __be32                  crc;    /* CRC of block */
        __be64                  blkno;  /* first block of the buffer */
        __be64                  lsn;    /* sequence number of last write */
        uuid_t                  uuid;   /* filesystem we belong to */
        __be64                  owner;  /* inode that owns the block */
};

struct xfs_dir3_data_hdr {
        struct xfs_dir3_blk_hdr hdr;
        xfs_dir2_data_free_t    best_free[XFS_DIR2_DATA_FD_COUNT];
        __be32                  pad;    /* 64 bit alignment */
};
```



```
typedef struct xfs_dir2_data_free {
        __be16                  offset;         /* start of freespace */
        __be16                  length;         /* length of freespace */
} xfs_dir2_data_free_t;
```



其中，XFS_DIR2_DATA_FD_COUNT定义为3，uuid_t为16字节长度，可以推算整体hdr结构为64字节。对应内容：

58 44 42 33：magic 

dd a1 a6 2c ：crc

00 00 00 00 00 00 00 58：blkno

00 00 00 01 00 00 06 b8：lsn

20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7 ：uuid

00 00 00 00 00 00 00 84：owner

03 28 0c 48：best_free[0] 

00 60 00 c0 ：best_free[1]

02 00 00 18 ：best_free[2]

00 00 00 00：pad

之后开始是目录项xfs_dir2_data_entry_t内容，结构为：

```
/*
 * Active entry in a data block.
 *
 * Aligned to 8 bytes.  After the variable length name field there is a
 * 2 byte tag field, which can be accessed using xfs_dir3_data_entry_tag_p.
 *
 * For dir3 structures, there is file type field between the name and the tag.
 * This can only be manipulated by helper functions. It is packed hard against
 * the end of the name so any padding for rounding is between the file type and
 * the tag.
 */
typedef struct xfs_dir2_data_entry {
        __be64                  inumber;        /* inode number */
        __u8                    namelen;        /* name length */
        __u8                    name[];         /* name bytes, no null */
     /* __u8                    filetype; */    /* type of inode we point to */
     /* __be16                  tag; */         /* starting offset of us */
} xfs_dir2_data_entry_t;
```



第一个文件：

00 00 00 00 00 00 00 84 ：inode编号，132

01 ：文件名长度，1字节

2e ：因为长度只有一个字节，所以这里使用1个字节存储文件名。文件名就是. 。

02 ：文件类型，2为目录。1为文件。

00 00：tag位。

00 00 40：8字节对齐填充。

以此类推，第二个文件为：

00 00 00 00 00 00 00 80 02 2e 2e 02 00 00 00 50

翻译为：inode：128，2字节长度，名为.. ，类型为目录。即，上级目录../。

然后是一个文件名比较长的文件，区别是，这个文件我们之前已经把它删除了。所以存储对应内容有变化，填充变成了：

```
#define XFS_DIR2_DATA_FREE_TAG  0xffff

/*
 * Unused entry in a data block.
 *
 * Aligned to 8 bytes.  Tag appears as the last 2 bytes and must be accessed
 * using xfs_dir2_data_unused_tag_p.
 */
typedef struct xfs_dir2_data_unused {
        __be16                  freetag;        /* XFS_DIR2_DATA_FREE_TAG */
        __be16                  length;         /* total free length */
                                                /* variable offset */
        __be16                  tag;            /* starting offset of us */
} xfs_dir2_data_unused_t;
```



注意，这里只是把原有xfs_dir2_data_entry_t结构头部变成了xfs_dir2_data_unused，后续剩余内容没变。

ff ff ：freetag，标志这段已经free。

00 c0 ：这段free的长度，192。

00 00 ：tag。

01 d9 b2 61 61 61 61 61 61 61：剩余为删除文件时未被擦除的内容。文件名长度为178字节的a。略过之后最后一行：

61 61 61 61 61 61 61 61 61 61 61 01 00 00 00 60。依然是filetype：1，tag：00 00。然后布齐填充。下行开始下个文件内容，以此类推。

由此可见，删除文件的时候，会清除文件xfs_dir2_data_entry_t中的inode中的部分数据。虽然还剩点没清除，但是对于大inode编号的文件来说，其inode内容已经无法参考。另外要注意的是，文件删除之后，标记的free长度是原本段xfs_dir2_data_entry_t占用的所有内容加上填充位。这段内容可能会在下个文件创建的时候被使用。不过根据测试看，创建文件不会立即复用，而是继续占用后续free空间，估计会在连续free的情况下才被复用。经实验验证，删除文件名sdl开头的长文件和9、10、11之后，有创建了passwd文件和services文件，此时文件变为local，因为inode本地内容足够存放现有信息。之后又创建出sdl开头长文件，索引块根之前相同位11号，之前aaaaaa开头文件相关内容被清零，但其空间未被占用，新创建文件内容从最后一个连续free块开始复用。

当文件core.format = 1 (local)时，文件目录项内容直接存储在inode节点中。起始位置在inode数据结构之后。inode结构为：xfs_dinode_t

```
#define XFS_DINODE_MAGIC                0x494e  /* 'IN' */
typedef struct xfs_dinode {
        __be16          di_magic;       /* inode magic # = XFS_DINODE_MAGIC */
        __be16          di_mode;        /* mode and type of file */
        __u8            di_version;     /* inode version */
        __u8            di_format;      /* format of di_c data */
        __be16          di_onlink;      /* old number of links to file */
        __be32          di_uid;         /* owner's user id */
        __be32          di_gid;         /* owner's group id */
        __be32          di_nlink;       /* number of links to file */
        __be16          di_projid_lo;   /* lower part of owner's project id */
        __be16          di_projid_hi;   /* higher part owner's project id */
        __u8            di_pad[6];      /* unused, zeroed space */
        __be16          di_flushiter;   /* incremented on flush */
        xfs_timestamp_t di_atime;       /* time last accessed */
        xfs_timestamp_t di_mtime;       /* time last modified */
        xfs_timestamp_t di_ctime;       /* time created/inode modified */
        __be64          di_size;        /* number of bytes in file */
        __be64          di_nblocks;     /* # of direct & btree blocks used */
        __be32          di_extsize;     /* basic/minimum extent size for file */
        __be32          di_nextents;    /* number of extents in data fork */
        __be16          di_anextents;   /* number of extents in attribute fork*/
        __u8            di_forkoff;     /* attr fork offs, <<3 for 64b align */
        __s8            di_aformat;     /* format of attr fork's data */
        __be32          di_dmevmask;    /* DMIG event mask */
        __be16          di_dmstate;     /* DMIG state info */
        __be16          di_flags;       /* random flags, XFS_DIFLAG_... */
        __be32          di_gen;         /* generation number */

        /* di_next_unlinked is the only non-core field in the old dinode */
        __be32          di_next_unlinked;/* agi unlinked list ptr */

        /* start of the extended dinode, writable fields */
        __le32          di_crc;         /* CRC of the inode */
        __be64          di_changecount; /* number of attribute changes */
        __be64          di_lsn;         /* flush sequence */
        __be64          di_flags2;      /* more random flags */
        __be32          di_cowextsize;  /* basic cow extent size for file */
        __u8            di_pad2[12];    /* more padding for future expansion */

        /* fields only written to during inode creation */
        xfs_timestamp_t di_crtime;      /* time created */
        __be64          di_ino;         /* inode number */
        uuid_t          di_uuid;        /* UUID of the filesystem */

        /* structure must be padded to 64 bit alignment */
} xfs_dinode_t;
```



总长度：176字节。

使用text方式显示类似inode内容：

```
xfs_db> inode 140
xfs_db> type text
xfs_db> p
000:  49 4e 41 ed 03 01 00 00 00 00 00 00 00 00 00 00  INA.............
010:  00 00 00 03 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 66 36 e8 1a fe b9 08 5e 66 36 e8 1b 0d fb 47  .f6......f6....G
030:  5e 66 36 e8 1b 0d fb 47 00 00 00 00 00 00 00 65  .f6....G.......e
040:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
050:  00 00 00 02 00 00 00 00 00 00 00 00 66 76 fc 7d  ............fv..
060:  ff ff ff ff 72 ab 26 4a 00 00 00 00 00 00 00 06  ....r..J........
070:  00 00 00 01 00 00 00 42 00 00 00 00 00 00 00 00  .......B........
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 66 36 e8 1a fe b9 08 00 00 00 00 00 00 00 8c  .f6.............
0a0:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
0b0:  04 00 00 00 00 80 07 00 60 70 6c 75 67 69 6e 73  .........plugins
0c0:  02 01 00 00 80 09 00 78 61 62 72 74 2e 63 6f 6e  .......xabrt.con
0d0:  66 01 00 00 00 8d 0d 00 90 67 70 67 5f 6b 65 79  f........gpg.key
0e0:  73 2e 63 6f 6e 66 01 00 00 00 8e 22 00 b0 61 62  s.conf........ab
0f0:  72 74 2d 61 63 74 69 6f 6e 2d 73 61 76 65 2d 70  rt.action.save.p
100:  61 63 6b 61 67 65 2d 64 61 74 61 2e 63 6f 6e 66  ackage.data.conf
110:  01 00 00 00 8f 00 00 00 00 00 00 00 00 00 00 00  ................
120:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
130:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
140:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
150:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
160:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
170:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
180:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
190:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1a0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1b0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1c0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1d0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1e0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1f0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
```



可以发现，此时目录项中没有.和..目录内容。直接存放其他目录和文件名。此时目录项结构也不再是xfs_dir3_data_hdr，取而代之的是：xfs_dir2_sf_hdr_t、xfs_dir2_sf_entry_t

```
/*
 * Directory layout when stored internal to an inode.
 *
 * Small directories are packed as tightly as possible so as to fit into the
 * literal area of the inode.  These "shortform" directories consist of a
 * single xfs_dir2_sf_hdr header followed by zero or more xfs_dir2_sf_entry
 * structures.  Due the different inode number storage size and the variable
 * length name field in the xfs_dir2_sf_entry all these structure are
 * variable length, and the accessors in this file should be used to iterate
 * over them.
 */
typedef struct xfs_dir2_sf_hdr {
        uint8_t                 count;          /* count of entries */
        uint8_t                 i8count;        /* count of 8-byte inode #s */
        uint8_t                 parent[8];      /* parent dir inode number */
} __packed xfs_dir2_sf_hdr_t;

typedef struct xfs_dir2_sf_entry {
        __u8                    namelen;        /* actual name length */
        __u8                    offset[2];      /* saved offset */
        __u8                    name[];         /* name, variable size */
        /*
         * A single byte containing the file type field follows the inode
         * number for version 3 directoinory entries.
         *
         * A 64-bit or 32-bit inode number follows here, at a variable offset
         * after the name.
         */
} xfs_dir2_sf_entry_t;
```



这里要注意的是，xfs_dir2_sf_hdr_t是个变长结构体，具体长度依赖是不是有64位inode编号。如果有，则parent是8个字节长度，如果没有64位inode编号，则parent是4字节长度。64位inode个数记录在i8count中。这个结构体到底多长，可以用这个函数来计算：

```
#define XFS_INO32_SIZE  4
#define XFS_INO64_SIZE  8
#define XFS_INO64_DIFF  (XFS_INO64_SIZE - XFS_INO32_SIZE)

static inline int xfs_dir2_sf_hdr_size(int i8count)
{
        return sizeof(struct xfs_dir2_sf_hdr) -
                (i8count == 0) * XFS_INO64_DIFF;
}
```

一个典型的目录项结构是：

0b0:  04 ：count目录中文件个数。

00 ：i8count

00 00 00 80 ：上级目录inode编号。之后目录项开始。

07 ：namelen

00 60 ：offset

70 6c 75 67 69 6e 73  .........plugins   一行到此结束，文件名结束。

0c0:  02： 文件类型，2为目录，1为文件。

01 00 00 80 ：此文件inode编号为：16777344。之后下个文件从namelen开始。

09 00 78 61 62 72 74 2e 63 6f 6e  .......xabrt.con

0d0:  66 01 00 00 00 8d 0d 00 90 67 70 67 5f 6b 65 79  f........gpg.key

以此类推。



## xfs的文件结构

xfs对于一般文件的存储方式只有两种，extents和btree。下面我们来分别看一下这两种方式是如何索引文件对应block的。

## extents格式存储文件

不同版本的xfs的inode结构并不相同，如果你在一个旧版本的linux上看到的结构将跟我们目前显示的不完全相同，但原理可供参考。我们先从文件的inode信息来查看一下xfs文件的结构。先在xfs文件系统上查看一下我们关注文件的inode编号：

```
[root@localhost zorro]# ls -li /mnt/services
869 -rw-r--r--. 1 root root 692241 Mar 15 10:35 /mnt/services
```

然后我们使用xfs_db来查看这个inode的相关信息：

```
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 869
xfs_db> p
core.magic = 0x494e
core.mode = 0100644
core.version = 3
core.format = 2 (extents)
core.nlinkv2 = 1
core.onlink = 0
core.projid_lo = 0
core.projid_hi = 0
core.uid = 0
core.gid = 0
core.flushiter = 0
core.atime.sec = Sun Mar 15 10:35:57 2020
core.atime.nsec = 088753917
core.mtime.sec = Sun Mar 15 10:35:57 2020
core.mtime.nsec = 097333514
core.ctime.sec = Sun Mar 15 10:35:57 2020
core.ctime.nsec = 097333514
core.size = 692241
core.nblocks = 170
core.extsize = 0
core.nextents = 1
core.naextents = 0
core.forkoff = 35
core.aformat = 1 (local)
core.dmevmask = 0
core.dmstate = 0
core.newrtbm = 0
core.prealloc = 0
core.realtime = 0
core.immutable = 0
core.append = 0
core.sync = 0
core.noatime = 0
core.nodump = 0
core.rtinherit = 0
core.projinherit = 0
core.nosymlinks = 0
core.extsz = 0
core.extszinherit = 0
core.nodefrag = 0
core.filestream = 0
core.gen = 3335666300
next_unlinked = null
v3.crc = 0x25456d88 (correct)
v3.change_count = 8
v3.lsn = 0x100000002
v3.flags2 = 0
v3.cowextsize = 0
v3.crtime.sec = Sun Mar 15 10:35:57 2020
v3.crtime.nsec = 088753917
v3.inumber = 869
v3.uuid = 141e4667-1269-4dce-b649-3b2090fd41c0
v3.reflink = 0
v3.cowextsz = 0
u3.bmx[0] = [startoff,startblock,blockcount,extentflag]
0:[0,585,170,0]
a.sfattr.hdr.totsize = 51
a.sfattr.hdr.count = 1
a.sfattr.list[0].namelen = 7
a.sfattr.list[0].valuelen = 37
a.sfattr.list[0].root = 0
a.sfattr.list[0].secure = 1
a.sfattr.list[0].name = "selinux"
a.sfattr.list[0].value = "unconfined_u:object_r:unlabeled_t:s0\000"
```

对于xfs的inode信息，我们主要关注如下几个对象：

core.format = 2 (extents)：对于一个文件来说，有两种format格式，extents表示inode的内容中直接索引存储文件内容的block。另外一种格式是btree方式，表示有以btree结构的多级extent树来索引相关block，这在文件足够大或文件碎片很多的时候会用到。

core.nblocks = 164：文件索引的块总数。

core.nextents = 1：有多少个extent索引信息。

u3.bmx[0] = [startoff,startblock,blockcount,extentflag]
0:[0,585,170,0]：这部分信息就是inode中的extent索引的信息。中括号中的数字分别表示：

0：本段extent的文件逻辑偏移量：startoff

585：本段extent指向的物理块编号：startblock

170：本段extent索引的从startblock之后的连续block个数：blockcount。

0：extentflag

xfs的inode结构体可以在内核源代码中的 fs/xfs/libxfs/xfs_format.h 找到定义，结构如下：

```
#define XFS_DINODE_MAGIC                0x494e  /* 'IN' */
typedef struct xfs_dinode {
        __be16          di_magic;       /* inode magic # = XFS_DINODE_MAGIC */
        __be16          di_mode;        /* mode and type of file */
        __u8            di_version;     /* inode version */
        __u8            di_format;      /* format of di_c data */
        __be16          di_onlink;      /* old number of links to file */
        __be32          di_uid;         /* owner's user id */
        __be32          di_gid;         /* owner's group id */
        __be32          di_nlink;       /* number of links to file */
        __be16          di_projid_lo;   /* lower part of owner's project id */
        __be16          di_projid_hi;   /* higher part owner's project id */
        __u8            di_pad[6];      /* unused, zeroed space */
        __be16          di_flushiter;   /* incremented on flush */
        xfs_timestamp_t di_atime;       /* time last accessed */
        xfs_timestamp_t di_mtime;       /* time last modified */
        xfs_timestamp_t di_ctime;       /* time created/inode modified */
        __be64          di_size;        /* number of bytes in file */
        __be64          di_nblocks;     /* # of direct & btree blocks used */
        __be32          di_extsize;     /* basic/minimum extent size for file */
        __be32          di_nextents;    /* number of extents in data fork */
        __be16          di_anextents;   /* number of extents in attribute fork*/
        __u8            di_forkoff;     /* attr fork offs, <<3 for 64b align */
        __s8            di_aformat;     /* format of attr fork's data */
        __be32          di_dmevmask;    /* DMIG event mask */
        __be16          di_dmstate;     /* DMIG state info */
        __be16          di_flags;       /* random flags, XFS_DIFLAG_... */
        __be32          di_gen;         /* generation number */

        /* di_next_unlinked is the only non-core field in the old dinode */
        __be32          di_next_unlinked;/* agi unlinked list ptr */

        /* start of the extended dinode, writable fields */
        __le32          di_crc;         /* CRC of the inode */
        __be64          di_changecount; /* number of attribute changes */
        __be64          di_lsn;         /* flush sequence */
        __be64          di_flags2;      /* more random flags */
        __be32          di_cowextsize;  /* basic cow extent size for file */
        __u8            di_pad2[12];    /* more padding for future expansion */

        /* fields only written to during inode creation */
        xfs_timestamp_t di_crtime;      /* time created */
        __be64          di_ino;         /* inode number */
        uuid_t          di_uuid;        /* UUID of the filesystem */

        /* structure must be padded to 64 bit alignment */
} xfs_dinode_t;
```

很容易统计到，这个结构体占用的字节数是：176字节。那么整个inode有多大呢？我们可以通过xfs的superblock信息找到答案，方法是：

```
 xfs_db /dev/sdk1
xfs_db> sb
xfs_db> p
magicnum = 0x58465342
blocksize = 4096
dblocks = 5242624
rblocks = 0
rextents = 0
uuid = 141e4667-1269-4dce-b649-3b2090fd41c0
logstart = 4194310
rootino = 128
rbmino = 129
rsumino = 130
rextsize = 1
agblocks = 1310656
agcount = 4
rbmblocks = 0
logblocks = 2560
versionnum = 0xb4b5
sectsize = 512
inodesize = 512
inopblock = 8
fname = "\000\000\000\000\000\000\000\000\000\000\000\000"
blocklog = 12
sectlog = 9
inodelog = 9
inopblog = 3
agblklog = 21
rextslog = 0
inprogress = 0
imax_pct = 25
icount = 2368
ifree = 88
fdblocks = 5232088
frextents = 0
uquotino = null
gquotino = null
qflags = 0
flags = 0
shared_vn = 0
inoalignmt = 8
unit = 0
width = 0
dirblklog = 0
logsectlog = 0
logsectsize = 0
logsunit = 1
features2 = 0x18a
bad_features2 = 0x18a
features_compat = 0
features_ro_compat = 0x5
features_incompat = 0x3
features_log_incompat = 0
crc = 0x7e4dc35e (correct)
spino_align = 4
pquotino = null
lsn = 0x1000006f0
meta_uuid = 00000000-0000-0000-0000-000000000000
```

使用xfs_db的sb命令可以定位查看到superblock信息。我们可以看到当前的文件系统inode长度为inodesize = 512字节。注意这个长度在不同版本的内核上的默认值不一样，在比较旧版本的内核上默认为256字节。我们还可以直接在xfs_db中查看这个inode的16进制信息内容：

```
xfs_db> inode 869
xfs_db> type text
xfs_db> p
000:  49 4e 81 a4 03 02 00 00 00 00 00 00 00 00 00 00  IN..............
010:  00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 6d 94 8d 05 4a 46 fd 5e 6d 94 8d 05 cd 31 0a  .m...JF..m....1.
030:  5e 6d 94 8d 05 cd 31 0a 00 00 00 00 00 0a 90 11  .m....1.........
040:  00 00 00 00 00 00 00 aa 00 00 00 00 00 00 00 01  ................
050:  00 00 23 01 00 00 00 00 00 00 00 00 c6 d2 3a 7c  ................
060:  ff ff ff ff 25 45 6d 88 00 00 00 00 00 00 00 08  .....Em.........
070:  00 00 00 01 00 00 00 02 00 00 00 00 00 00 00 00  ................
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 6d 94 8d 05 4a 46 fd 00 00 00 00 00 00 03 65  .m...JF........e
0a0:  14 1e 46 67 12 69 4d ce b6 49 3b 20 90 fd 41 c0  ..Fg.iM..I....A.
0b0:  00 00 00 00 00 00 00 00 00 00 00 00 49 20 00 aa  ............I...
0c0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0d0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0e0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0f0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
100:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
110:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
120:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
130:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
140:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
150:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
160:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
170:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
180:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
190:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1a0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1b0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1c0:  00 00 00 00 00 00 00 00 00 33 01 7d 07 25 04 73  .........3.....s
1d0:  65 6c 69 6e 75 78 75 6e 63 6f 6e 66 69 6e 65 64  elinuxunconfined
1e0:  5f 75 3a 6f 62 6a 65 63 74 5f 72 3a 75 6e 6c 61  .u.object.r.unla
1f0:  62 65 6c 65 64 5f 74 3a 73 30 00 00 00 00 00 00  beled.t.s0......
```

xfs的inode从头开始就是xfs_dinode_t的信息，占用176字节。之后紧接着就是文件的extent索引信息。我们发现最后一段还有一部分信息，这部分是扩展属性记录字段，主要用来标记selinux的安全上下文信息，我们暂不关注这部分扩展属性。inode的大致结构如下图显示：

<img src="https://zorrozou.github.io/docs/xfs/2.png" alt="image-20200413113534883" style="zoom:50%;" />

一个extent结构定义如下：

```
/*
 * Bmap btree record and extent descriptor.
 *  l0:63 is an extent flag (value 1 indicates non-normal).
 *  l0:9-62 are startoff.
 *  l0:0-8 and l1:21-63 are startblock.
 *  l1:0-20 are blockcount.
 */
#define BMBT_EXNTFLAG_BITLEN    1
#define BMBT_STARTOFF_BITLEN    54
#define BMBT_STARTBLOCK_BITLEN  52
#define BMBT_BLOCKCOUNT_BITLEN  21

#define BMBT_STARTOFF_MASK      ((1ULL << BMBT_STARTOFF_BITLEN) - 1)

typedef struct xfs_bmbt_rec {
        __be64                  l0, l1;
} xfs_bmbt_rec_t;
```

所以一个extent正好是128bit，共占用16个字节。也就是上面正好一行的结构。

这一行被按bit位区分成了4段：

BMBT_EXNTFLAG_BITLEN：占用1bit，表示本段extent是否正常。其值为1表示非正常。

BMBT_STARTOFF_BITLEN：占用54bit，表示文件逻辑块本段起始偏移量块数。

BMBT_STARTBLOCK_BITLEN：占用52bit，表示文件物理块本段起始块数。

BMBT_BLOCKCOUNT_BITLEN：占用21bit，表示本段连续索引块个数。

对于本文件来说，0b0标示的一整行就是其extent信息内容：

0b0:  00 00 00 00 00 00 00 00 00 00 00 00 49 20 00 aa

因为xfs是大端字节序，所以从左至右依次对应以上四段。根据按bit定义的四段含义，我们可以推算出其四段数值分别为：0，0，585，170。跟inode显示的内容一致。

当文件内容一个extent存储不完后，inode会启用其后续空闲空间记录更多的extent。我们来查看一个类似状态的文件：

```
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 959
xfs_db> p
core.magic = 0x494e
core.mode = 0100644
......
u3.bmx[0-5] = [startoff,startblock,blockcount,extentflag]
0:[0,954,262128,0]
1:[262128,4333175,229392,0]
2:[491520,4824711,131056,0]
3:[622576,6292348,131072,0]
4:[753648,6685580,229376,0]
5:[983024,7226268,65552,0]
a.sfattr.hdr.totsize = 51
a.sfattr.hdr.count = 1
a.sfattr.list[0].namelen = 7
a.sfattr.list[0].valuelen = 37
a.sfattr.list[0].root = 0
a.sfattr.list[0].secure = 1
a.sfattr.list[0].name = "selinux"
a.sfattr.list[0].value = "unconfined_u:object_r:unlabeled_t:s0\000"

xfs_db> type text
xfs_db> p
000:  49 4e 81 a4 03 02 00 00 00 00 00 00 00 00 00 00  IN..............
010:  00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 6d 9f 4e 25 d1 d5 19 5e 6d 9f 50 03 0b a2 dd  .m.N.....m.P....
030:  5e 6d 9f 50 03 0b a2 dd 00 00 00 01 00 00 00 00  .m.P............
040:  00 00 00 00 00 10 00 00 00 00 00 00 00 00 00 06  ................
050:  00 00 23 01 00 00 00 00 00 00 00 00 f0 ca ad 26  ................
060:  ff ff ff ff 40 29 1e 78 00 00 00 00 00 00 00 6b  .......x.......k
070:  00 00 00 01 00 00 07 6d 00 00 00 00 00 00 00 00  .......m........
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 6d 9f 4e 25 d1 d5 19 00 00 00 00 00 00 03 bf  .m.N............
0a0:  14 1e 46 67 12 69 4d ce b6 49 3b 20 90 fd 41 c0  ..Fg.iM..I....A.
0b0:  00 00 00 00 00 00 00 00 00 00 00 00 77 43 ff f0  ............wC..
0c0:  00 00 00 00 07 ff e0 00 00 00 08 43 ce e3 80 10  ...........C....
0d0:  00 00 00 00 0f 00 00 00 00 00 09 33 d0 e1 ff f0  ...........3....
0e0:  00 00 00 00 12 ff e0 00 00 00 0c 00 6f 82 00 00  ............o...
0f0:  00 00 00 00 16 ff e0 00 00 00 0c c0 71 83 80 00  ............q...
100:  00 00 00 00 1d ff e0 00 00 00 0d c8 73 81 00 10  ............s...
110:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
120:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
130:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
140:  00 71 e3 9c 00 00 00 00 00 00 00 00 00 00 00 00  .q..............
150:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
160:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
170:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
180:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
190:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1a0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1b0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1c0:  00 00 00 00 00 00 00 00 00 33 01 21 07 25 04 73  .........3.....s
1d0:  65 6c 69 6e 75 78 75 6e 63 6f 6e 66 69 6e 65 64  elinuxunconfined
1e0:  5f 75 3a 6f 62 6a 65 63 74 5f 72 3a 75 6e 6c 61  .u.object.r.unla
1f0:  62 65 6c 65 64 5f 74 3a 73 30 00 00 00 00 00 00  beled.t.s0......
```

从当前inode结构可以推断，其存放extents的空间最多可以存放17个extent。当索引的extent超过17个之后，inode会转为btree方式以树的方式存放更多的extent。

## btree格式存储文件

下面我们来创建并查看一个btree格式存储的文件信息：

```
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 959
xfs_db> p
core.magic = 0x494e
core.mode = 0100644
core.version = 3
core.format = 3 (btree)
......
core.size = 9663676416
core.nblocks = 2359297
core.extsize = 0
core.nextents = 19
......
u3.bmbt.level = 1
u3.bmbt.numrecs = 1
u3.bmbt.keys[1] = [startoff]
1:[0]
u3.bmbt.ptrs[1] = 7463836
a.sfattr.hdr.totsize = 51
a.sfattr.hdr.count = 1
a.sfattr.list[0].namelen = 7
a.sfattr.list[0].valuelen = 37
a.sfattr.list[0].root = 0
a.sfattr.list[0].secure = 1
a.sfattr.list[0].name = "selinux"
a.sfattr.list[0].value = "unconfined_u:object_r:unlabeled_t:s0\000"
xfs_db> type text
xfs_db> p
000:  49 4e 81 a4 03 03 00 00 00 00 00 00 00 00 00 00  IN..............
010:  00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 6d 9f 4e 25 d1 d5 19 5e 6d a0 b2 2f 31 ee c2  .m.N.....m...1..
030:  5e 6d a0 b2 2f 31 ee c2 00 00 00 02 40 00 00 00  .m...1..........
040:  00 00 00 00 00 24 00 01 00 00 00 00 00 00 00 13  ................
050:  00 00 23 01 00 00 00 00 00 00 00 00 f0 ca ad 26  ................
060:  ff ff ff ff a6 81 66 95 00 00 00 00 00 00 03 b8  ......f.........
070:  00 00 00 01 00 00 07 b7 00 00 00 00 00 00 00 00  ................
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 6d 9f 4e 25 d1 d5 19 00 00 00 00 00 00 03 bf  .m.N............
0a0:  14 1e 46 67 12 69 4d ce b6 49 3b 20 90 fd 41 c0  ..Fg.iM..I....A.
0b0:  00 01 00 01 00 00 00 00 00 00 00 00 77 00 ff f0  ............w...
0c0:  00 00 00 00 01 ff e0 00 00 00 02 10 77 01 00 00  ............w...
0d0:  00 00 00 00 03 ff e0 00 00 00 01 10 77 02 00 00  ............w...
0e0:  00 00 00 00 07 ff e0 00 00 00 00 00 77 43 ff f6  ............wC..
0f0:  00 00 00 00 0f ff cc 00 00 00 04 00 73 61 fc 0a  ............sa..
100:  00 00 00 00 13 f7 e0 00 00 00 04 b0 77 62 00 00  ............wb..
110:  00 00 00 00 17 f7 e0 00 00 00 08 43 ce e3 80 10  ...........C....
120:  00 00 00 00 1e f8 00 00 00 00 09 33 d0 e1 ff f0  ...........3....
130:  00 00 00 00 22 f7 e0 00 00 00 0c 00 00 00 00 00  ................
140:  00 71 e3 9c 26 f7 e0 00 00 00 0c c0 71 83 80 00  .q..........q...
150:  00 00 00 00 2d f7 e0 00 00 00 0d c8 73 81 80 00  ............s...
160:  00 00 00 00 30 f7 e0 00 00 00 05 a0 79 62 00 00  ....0.......yb..
170:  00 00 00 00 34 f7 e0 00 00 00 09 73 ce e1 80 10  ....4......s....
180:  00 00 00 00 37 f8 00 00 00 00 0a 2b d2 e1 80 00  ....7...........
190:  00 00 00 00 3a f8 00 00 00 00 0d f8 73 80 ff f0  ............s...
1a0:  00 00 00 00 3c f7 e0 00 00 00 04 f0 77 61 00 00  ............wa..
1b0:  00 00 00 00 3e f7 e0 00 00 00 05 e0 79 60 84 10  ............y...
1c0:  00 00 00 00 00 00 00 00 00 33 01 21 07 25 04 73  .........3.....s
1d0:  65 6c 69 6e 75 78 75 6e 63 6f 6e 66 69 6e 65 64  elinuxunconfined
1e0:  5f 75 3a 6f 62 6a 65 63 74 5f 72 3a 75 6e 6c 61  .u.object.r.unla
1f0:  62 65 6c 65 64 5f 74 3a 73 30 00 00 00 00 00 00  beled.t.s0......
```

此时我们看到，这个文件一共索引了19个extents：

树的层级为：u3.bmbt.level = 1

存放btree数据结构的个数为：u3.bmbt.numrecs = 1

其位置为：u3.bmbt.keys[1] = [startoff]1:[0]

其指向磁盘的块编号为：u3.bmbt.ptrs[1] = 7463836

这就是说，本inode节点指向了一个block，编号为：7463836，其内容为指向下一级的extent索引。此时inode中原本存储extent数组的空间开始存放的是bmbt树的根节点相关结构体xfs_bmdr_block_t，其内容为：

```
/*
 * Bmap root header, on-disk form only.
 */
typedef struct xfs_bmdr_block {
        __be16          bb_level;       /* 0 is a leaf */
        __be16          bb_numrecs;     /* current # of data records */
} xfs_bmdr_block_t;
```

之后紧接着是xfs_bmbt_key相关结构。

```
/*
 * Key structure for non-leaf levels of the tree.
 */
typedef struct xfs_bmbt_key {
        __be64          br_startoff;    /* starting file offset */
} xfs_bmbt_key_t, xfs_bmdr_key_t;
```

再之后隔了部分空闲空间之后存放

```
/* btree pointer type */
typedef __be64 xfs_bmbt_ptr_t, xfs_bmdr_ptr_t;
```

结构如下图：

<img src="https://zorrozou.github.io/docs/xfs/3.png" alt="image-20200413113852722" style="zoom:50%;" />

其中xfs_bmbt_key记录了文件的逻辑block偏移量块编号，xfs_bmbt_ptr_t记录的是文件物理块偏移量编号。对应在本inode中的内容分别为：

0b0行：

00 01 00 01 ：xfs_bmdr_block

之后紧接着：

00 00 00 00 00 00 00 00：xfs_bmbt_key

130行后4个字节和140行前4个字节组合：

00 00 00 00 00 71 e3 9c ：xfs_bmbt_ptr_t

此时xfs_bmbt_ptr_t指向的block内容为叶子结点结构：

可以先观察其内容：

```
xfs_db> fsblock 7463836
xfs_db> type text
xfs_db> p
000:  42 4d 41 33 00 00 00 13 ff ff ff ff ff ff ff ff  BMA3............
010:  ff ff ff ff ff ff ff ff 00 00 00 00 02 6f 16 e0  .............o..
020:  00 00 00 01 00 00 07 b7 14 1e 46 67 12 69 4d ce  ..........Fg.iM.
030:  b6 49 3b 20 90 fd 41 c0 00 00 00 00 00 00 03 bf  .I....A.........
040:  ec f9 f1 7d 00 00 00 00 00 00 00 00 00 00 00 00  ................
050:  00 00 00 00 77 43 ff f0 00 00 00 00 07 ff e0 00  ....wC..........
060:  00 00 08 43 ce e3 80 10 00 00 00 00 0f 00 00 00  ...C............
070:  00 00 09 33 d0 e1 ff f0 00 00 00 00 12 ff e0 00  ...3............
080:  00 00 0c 00 6f 82 00 00 00 00 00 00 16 ff e0 00  ....o...........
090:  00 00 0c c0 71 83 80 00 00 00 00 00 1d ff e0 00  ....q...........
0a0:  00 00 0d c8 73 81 80 00 00 00 00 00 20 ff e0 00  ....s...........
0b0:  00 00 01 10 77 02 00 00 00 00 00 00 24 ff e0 00  ....w...........
0c0:  00 00 05 a0 79 63 80 00 00 00 00 00 2b ff e0 00  ....yc..........
0d0:  00 00 04 b0 77 63 80 00 00 00 00 00 32 ff e0 00  ....wc......2...
0e0:  00 00 04 00 73 62 00 10 00 00 00 00 37 00 00 00  ....sb......7...
0f0:  00 00 09 73 ce e1 80 10 00 00 00 00 3a 00 20 00  ...s............
100:  00 00 0a 2b d2 e0 ff e0 00 00 00 00 3b ff e0 00  ................
110:  00 00 0d f8 73 81 00 00 00 00 00 00 3d ff e0 00  ....s...........
120:  00 00 02 10 77 01 80 00 00 00 00 00 40 ff e0 00  ....w...........
130:  00 00 01 50 77 01 80 00 00 00 00 00 43 ff e0 00  ...Pw.......C...
140:  00 00 0d b0 71 80 c0 00 00 00 00 00 45 7f e0 00  ....q.......E...
150:  00 00 0a 4b ce e0 80 20 00 00 00 00 46 80 20 00  ...K........F...
160:  00 00 0e 18 73 80 80 00 00 00 00 00 47 80 20 00  ....s.......G...
170:  00 00 0c b0 71 80 3f f0 00 00 00 00 00 00 00 00  ....q...........
180:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
190:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
1a0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
......
```

从头开始，它包含了如下结构：

```
/*
 * Generic Btree block format definitions
 *
 * This is a combination of the actual format used on disk for short and long
 * format btrees.  The first three fields are shared by both format, but the
 * pointers are different and should be used with care.
 *
 * To get the size of the actual short or long form headers please use the size
 * macros below.  Never use sizeof(xfs_btree_block).
 *
 * The blkno, crc, lsn, owner and uuid fields are only available in filesystems
 * with the crc feature bit, and all accesses to them must be conditional on
 * that flag.
 */
/* short form block header */
struct xfs_btree_block_shdr {
        __be32          bb_leftsib;
        __be32          bb_rightsib;

        __be64          bb_blkno;
        __be64          bb_lsn;
        uuid_t          bb_uuid;
        __be32          bb_owner;
        __le32          bb_crc;
};

/* long form block header */
struct xfs_btree_block_lhdr {
        __be64          bb_leftsib;
        __be64          bb_rightsib;

        __be64          bb_blkno;
        __be64          bb_lsn;
        uuid_t          bb_uuid;
        __be64          bb_owner;
        __le32          bb_crc;
        __be32          bb_pad; /* padding for alignment */
};
struct xfs_btree_block {
        __be32          bb_magic;       /* magic number for block type */
        __be16          bb_level;       /* 0 is a leaf */
        __be16          bb_numrecs;     /* current # of data records */
        union {
                struct xfs_btree_block_shdr s;
                struct xfs_btree_block_lhdr l;
        } bb_u;                         /* rest */
};
```

我们当前文件用的是xfs_btree_block_lhdr结构，后续就是熟悉的xfs_bmbt_rec结构指向对应的block索引信息了。整体结构如图所示：

<img src="https://zorrozou.github.io/docs/xfs/4.png" alt="image-20200413113941141" style="zoom:50%;" />

如果文件内容更多，则需要多级索引。此时会引入中间节点block结构。此时其结构就是叶子节点的xfs_btree_block的头部加上根节点xfs_bmbt_key_t和xfs_bmbt_ptr_t的组合。结构如下：

<img src="https://zorrozou.github.io/docs/xfs/5.png" alt="image-20200413114026483" style="zoom:50%;" />

xfs多级树结构整体索引示意图：

![image-20200413114056513](https://zorrozou.github.io/docs/xfs/6.png)



## inode文件删除特征

我们先来观察一个extent存储方式的文件删除前后的inode信息变化：

```
[root@localhost zorro]# ls -i /mnt/services
886 /mnt/services
[root@localhost zorro]# umount /mnt
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 886
xfs_db> type text
xfs_db> p
000:  49 4e 81 a4 03 02 00 00 00 00 00 00 00 00 00 00  IN..............
010:  00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 70 4a f1 34 e9 69 b6 5e 70 4a f1 35 07 ee 2c  .pJ.4.i..pJ.5...
030:  5e 70 4a f1 35 07 ee 2c 00 00 00 00 00 0a 90 11  .pJ.5...........
040:  00 00 00 00 00 00 00 aa 00 00 00 00 00 00 00 01  ................
050:  00 00 00 02 00 00 00 00 00 00 00 00 bc e1 67 47  ..............gG
060:  ff ff ff ff 1e 4b 7a 0f 00 00 00 00 00 00 00 06  .....Kz.........
070:  00 00 00 01 00 00 1a 09 00 00 00 00 00 00 00 00  ................
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 70 4a f1 34 e9 69 b6 00 00 00 00 00 00 03 76  .pJ.4.i........v
0a0:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
0b0:  00 00 00 00 00 00 00 00 00 00 00 01 6c 20 00 aa  ............l...
0c0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
......
xfs_db> type inode
xfs_db> p
core.magic = 0x494e
core.mode = 0100644
core.version = 3
core.format = 2 (extents)
core.nlinkv2 = 1
core.onlink = 0
core.projid_lo = 0
core.projid_hi = 0
core.uid = 0
core.gid = 0
core.flushiter = 0
core.atime.sec = Tue Mar 17 11:58:41 2020
core.atime.nsec = 855712332
core.mtime.sec = Tue Mar 17 11:58:41 2020
core.mtime.nsec = 855712332
core.ctime.sec = Tue Mar 17 11:58:41 2020
core.ctime.nsec = 855712332
core.size = 2179
core.nblocks = 1
core.extsize = 0
core.nextents = 1
core.naextents = 0
core.forkoff = 0
core.aformat = 2 (extents)
core.dmevmask = 0
core.dmstate = 0
core.newrtbm = 0
core.prealloc = 0
core.realtime = 0
core.immutable = 0
core.append = 0
core.sync = 0
core.noatime = 0
core.nodump = 0
core.rtinherit = 0
core.projinherit = 0
core.nosymlinks = 0
core.extsz = 0
core.extszinherit = 0
core.nodefrag = 0
core.filestream = 0
core.gen = 475125725
next_unlinked = null
v3.crc = 0x80c1e041 (correct)
v3.change_count = 6
v3.lsn = 0x100001a09
v3.flags2 = 0
v3.cowextsize = 0
v3.crtime.sec = Tue Mar 17 11:58:41 2020
v3.crtime.nsec = 855712332
v3.inumber = 864
v3.uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
v3.reflink = 0
v3.cowextsz = 0
u3.bmx[0] = [startoff,startblock,blockcount,extentflag]
0:[0,710,1,0]
```

删除后：

```
[root@localhost zorro]# mount /dev/sdb1 /mnt
[root@localhost zorro]# rm /mnt/services
rm: remove regular file '/mnt/services'? y
[root@localhost zorro]# umount /mnt
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 886
xfs_db> p
core.magic = 0x494e
core.mode = 0
core.version = 3
core.format = 2 (extents)
core.nlinkv2 = 0
core.onlink = 0
core.projid_lo = 0
core.projid_hi = 0
core.uid = 0
core.gid = 0
core.flushiter = 0
core.atime.sec = Tue Mar 17 11:58:41 2020
core.atime.nsec = 887712182
core.mtime.sec = Tue Mar 17 11:58:41 2020
core.mtime.nsec = 889712172
core.ctime.sec = Tue Mar 17 16:10:58 2020
core.ctime.nsec = 093677462
core.size = 0
core.nblocks = 0
core.extsize = 0
core.nextents = 0
core.naextents = 0
core.forkoff = 0
core.aformat = 2 (extents)
core.dmevmask = 0
core.dmstate = 0
core.newrtbm = 0
core.prealloc = 0
core.realtime = 0
core.immutable = 0
core.append = 0
core.sync = 0
core.noatime = 0
core.nodump = 0
core.rtinherit = 0
core.projinherit = 0
core.nosymlinks = 0
core.extsz = 0
core.extszinherit = 0
core.nodefrag = 0
core.filestream = 0
core.gen = 3168888648
next_unlinked = null
v3.crc = 0x819558c4 (correct)
v3.change_count = 12
v3.lsn = 0x100001fe2
v3.flags2 = 0
v3.cowextsize = 0
v3.crtime.sec = Tue Mar 17 11:58:41 2020
v3.crtime.nsec = 887712182
v3.inumber = 886
v3.uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
v3.reflink = 0
v3.cowextsz = 0
u3 = (empty)
xfs_db> type text
xfs_db> p
000:  49 4e 00 00 03 02 00 00 00 00 00 00 00 00 00 00  IN..............
010:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 70 4a f1 34 e9 69 b6 5e 70 4a f1 35 07 ee 2c  .pJ.4.i..pJ.5...
030:  5e 70 86 12 05 95 67 96 00 00 00 00 00 00 00 00  .p....g.........
040:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
050:  00 00 00 02 00 00 00 00 00 00 00 00 bc e1 67 48  ..............gH
060:  ff ff ff ff 81 95 58 c4 00 00 00 00 00 00 00 0c  ......X.........
070:  00 00 00 01 00 00 1f e2 00 00 00 00 00 00 00 00  ................
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 70 4a f1 34 e9 69 b6 00 00 00 00 00 00 03 76  .pJ.4.i........v
0a0:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
0b0:  00 00 00 00 00 00 00 00 00 00 00 01 6c 20 00 aa  ............l...
0c0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
```

通过对比会发现：

inode属性信息中的u3.bmx对应信息在文件删除后已经清空了。但实际存放这部分信息的对应位置内容仍在。对应行是

0b0:  00 00 00 00 00 00 00 00 00 00 00 01 6c 20 00 aa

除此之外我们没有其他标志可以识别这个inode是否曾经被使用过。对于btree格式的文件内容也类似，我们来看一下：

```
[root@localhost zorro]# for i in `seq 1 20`;do dd if=/dev/zero of=/mnt/test/testfile$i bs=1M count=1024;done
[root@localhost zorro]#
[root@localhost zorro]# rm /mnt/test/testfile[1,3,5,7,9]
rm: remove regular file '/mnt/test/testfile1'? y
rm: remove regular file '/mnt/test/testfile3'? y
rm: remove regular file '/mnt/test/testfile5'? y
rm: remove regular file '/mnt/test/testfile7'? y
rm: remove regular file '/mnt/test/testfile9'? y
[root@localhost zorro]# rm /mnt/test/testfile1[1,3,5,7,9]
rm: remove regular file '/mnt/test/testfile11'? y
rm: remove regular file '/mnt/test/testfile13'? y
rm: remove regular file '/mnt/test/testfile15'? y
rm: remove regular file '/mnt/test/testfile17'? y
rm: remove regular file '/mnt/test/testfile19'? y
[root@localhost zorro]# dd if=/dev/zero of=/mnt/testfile bs=1M
dd: error writing '/mnt/testfile': No space left on device
10241+0 records in
10240+0 records out
10737418240 bytes (11 GB, 10 GiB) copied, 5.00521 s, 2.1 GB/s
[root@localhost zorro]# ls -i /mnt/testfile
1063 /mnt/testfile
[root@localhost zorro]# umount /mnt
[root@localhost zorro]# xfs^C
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 1063
xfs_db> p
core.magic = 0x494e
core.mode = 0100644
core.version = 3
core.format = 3 (btree)
core.nlinkv2 = 1
core.onlink = 0
core.projid_lo = 0
core.projid_hi = 0
core.uid = 0
core.gid = 0
core.flushiter = 0
core.atime.sec = Tue Mar 17 16:35:54 2020
core.atime.nsec = 804481847
core.mtime.sec = Tue Mar 17 16:35:59 2020
core.mtime.nsec = 809467679
core.ctime.sec = Tue Mar 17 16:35:59 2020
core.ctime.nsec = 809467679
core.size = 10737418240
core.nblocks = 2621441
core.extsize = 0
core.nextents = 29
core.naextents = 0
core.forkoff = 0
core.aformat = 2 (extents)
core.dmevmask = 0
core.dmstate = 0
core.newrtbm = 0
core.prealloc = 0
core.realtime = 0
core.immutable = 0
core.append = 0
core.sync = 0
core.noatime = 0
core.nodump = 0
core.rtinherit = 0
core.projinherit = 0
core.nosymlinks = 0
core.extsz = 0
core.extszinherit = 0
core.nodefrag = 0
core.filestream = 0
core.gen = 4032154936
next_unlinked = null
v3.crc = 0x9247149 (correct)
v3.change_count = 267
v3.lsn = 0x100002039
v3.flags2 = 0
v3.cowextsize = 0
v3.crtime.sec = Tue Mar 17 16:35:54 2020
v3.crtime.nsec = 804481847
v3.inumber = 1063
v3.uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
v3.reflink = 0
v3.cowextsz = 0
u3.bmbt.level = 1
u3.bmbt.numrecs = 1
u3.bmbt.keys[1] = [startoff]
1:[0]
u3.bmbt.ptrs[1] = 857592
xfs_db> type text
xfs_db> p
000:  49 4e 81 a4 03 03 00 00 00 00 00 00 00 00 00 00  IN..............
010:  00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 70 8b ea 2f f3 6b 37 5e 70 8b ef 30 3f 7f 1f  .p....k7.p..0...
030:  5e 70 8b ef 30 3f 7f 1f 00 00 00 02 80 00 00 00  .p..0...........
040:  00 00 00 00 00 28 00 01 00 00 00 00 00 00 00 1d  ................
050:  00 00 00 02 00 00 00 00 00 00 00 00 f0 55 cd 38  .............U.8
060:  ff ff ff ff 09 24 71 49 00 00 00 00 00 00 01 0b  ......qI........
070:  00 00 00 01 00 00 20 39 00 00 00 00 00 00 00 00  .......9........
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 70 8b ea 2f f3 6b 37 00 00 00 00 00 00 04 27  .p....k7........
0a0:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
0b0:  00 01 00 01 00 00 00 00 00 00 00 00 00 00 00 00  ................
0c0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0d0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0e0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0f0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
100:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
110:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
120:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
130:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
140:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
150:  00 00 00 00 00 00 00 00 00 0d 15 f8 00 00 00 00  ................
160:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
......
```

删除之后：

```
[root@localhost zorro]# mount /dev/sdb1 /mnt
[root@localhost zorro]# rm /mnt/testfile
rm: remove regular file '/mnt/testfile'? y
[root@localhost zorro]# umount /mnt
[root@localhost zorro]# xfs_db /dev/sdb1
xfs_db> inode 1063
xfs_db> p
core.magic = 0x494e
core.mode = 0
core.version = 3
core.format = 2 (extents)
core.nlinkv2 = 0
core.onlink = 0
core.projid_lo = 0
core.projid_hi = 0
core.uid = 0
core.gid = 0
core.flushiter = 0
core.atime.sec = Tue Mar 17 16:35:54 2020
core.atime.nsec = 804481847
core.mtime.sec = Tue Mar 17 16:35:59 2020
core.mtime.nsec = 809467679
core.ctime.sec = Tue Mar 17 16:39:54 2020
core.ctime.nsec = 243294400
core.size = 0
core.nblocks = 0
core.extsize = 0
core.nextents = 0
core.naextents = 0
core.forkoff = 0
core.aformat = 2 (extents)
core.dmevmask = 0
core.dmstate = 0
core.newrtbm = 0
core.prealloc = 0
core.realtime = 0
core.immutable = 0
core.append = 0
core.sync = 0
core.noatime = 0
core.nodump = 0
core.rtinherit = 0
core.projinherit = 0
core.nosymlinks = 0
core.extsz = 0
core.extszinherit = 0
core.nodefrag = 0
core.filestream = 0
core.gen = 4032154937
next_unlinked = null
v3.crc = 0x5950831f (correct)
v3.change_count = 327
v3.lsn = 0x10000204b
v3.flags2 = 0
v3.cowextsize = 0
v3.crtime.sec = Tue Mar 17 16:35:54 2020
v3.crtime.nsec = 804481847
v3.inumber = 1063
v3.uuid = 20de1c54-1c57-45ca-a487-de87fc1d92e7
v3.reflink = 0
v3.cowextsz = 0
u3 = (empty)
xfs_db> type text
xfs_db> p
000:  49 4e 00 00 03 02 00 00 00 00 00 00 00 00 00 00  IN..............
010:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
020:  5e 70 8b ea 2f f3 6b 37 5e 70 8b ef 30 3f 7f 1f  .p....k7.p..0...
030:  5e 70 8c da 0e 80 60 c0 00 00 00 00 00 00 00 00  .p..............
040:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
050:  00 00 00 02 00 00 00 00 00 00 00 00 f0 55 cd 39  .............U.9
060:  ff ff ff ff 59 50 83 1f 00 00 00 00 00 00 01 47  ....YP.........G
070:  00 00 00 01 00 00 20 4b 00 00 00 00 00 00 00 00  .......K........
080:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
090:  5e 70 8b ea 2f f3 6b 37 00 00 00 00 00 00 04 27  .p....k7........
0a0:  20 de 1c 54 1c 57 45 ca a4 87 de 87 fc 1d 92 e7  ...T.WE.........
0b0:  00 01 00 01 00 00 00 00 00 00 00 00 00 00 00 00  ................
0c0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0d0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0e0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
0f0:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
100:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
110:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
120:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
130:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
140:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
150:  00 00 00 00 00 00 00 00 00 0d 15 f8 00 00 00 00  ................
160:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
```

观察可知，inode中的btree相关索引信息仍然还在。其指向的相关block信息也不会被清空。我们可以以此信息来恢复相关文件数据。



<iframe src="https://qiyukf.com/sdk/res/delegate.html?1586747772206" style="border: 0px; margin: 0px; padding: 0px; cursor: default !important; height: 0px; width: 0px;"></iframe>





