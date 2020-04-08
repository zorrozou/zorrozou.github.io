# ext4数据恢复实战及文件系统结构详解

## 前言

如果你的数据被不小心误删除了，那么对文件系统结构的深入理解可以帮助你找到数据恢复的途径。我们先从一个数据恢复的例子开始，对ext4的文件系统结构做个介绍。

## ext4数据恢复实战

废话少说，下面我们直接上手进行数据恢复的实例。先格式化一个ext4文件系统。

```
mkfs.ext4 /dev/sdf1 
mke2fs 1.42.9 (28-Dec-2013)
Filesystem label=
OS type: Linux
Block size=4096 (log=2)
Fragment size=4096 (log=2)
Stride=0 blocks, Stripe width=0 blocks
122101760 inodes, 488378390 blocks
24418919 blocks (5.00%) reserved for the super user
First data block=0
Maximum filesystem blocks=2636120064
14905 block groups
32768 blocks per group, 32768 fragments per group
8192 inodes per group
Superblock backups stored on blocks: 
	32768, 98304, 163840, 229376, 294912, 819200, 884736, 1605632, 2654208, 
	4096000, 7962624, 11239424, 20480000, 23887872, 71663616, 78675968, 
	102400000, 214990848

Allocating group tables: done                            
Writing inode tables: done                            
Creating journal (32768 blocks): done
Writing superblocks and filesystem accounting information: done       
```

挂载到测试目录：
```
mount /dev/sdf1 /test
df -h
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        20G  8.3G   11G  45% /
devtmpfs         32G     0   32G   0% /dev
tmpfs            32G     0   32G   0% /dev/shm
tmpfs            32G  259M   31G   1% /run
tmpfs            32G     0   32G   0% /sys/fs/cgroup
/dev/sda3        20G  2.2G   17G  12% /usr/local
tmpfs           6.3G     0  6.3G   0% /run/user/0
/dev/sdf1       1.8T   77M  1.7T   1% /test
```

/test是我们这次做测试的目录。我们给这个目录下创建一些文件，为了文件内容比较好分辨，我们使用/etc/下的文件作为测试文件。因为都是普通文本文件，肉眼比较方便区分文件内容。
```
 cp -rf /etc/* /test/
 ls /test/
DIR_COLORS                      hosts.allow                       quotatab
DIR_COLORS.256color             hosts.deny                        rc.d
DIR_COLORS.lightbgcolor         idmapd.conf                       rc.local
GREP_COLORS                     infiniband                        rc0.d
GeoIP.conf                      init.d                            rc1.d
GeoIP.conf.default              inittab                           rc2.d
HOSTNAME                        inputrc                           rc3.d
NetworkManager                  iproute2                          rc4.d
X11                             issue                             rc5.d
acpi                            issue.net                         rc6.d
......
```
为了恢复测试方便，我们使用passwd文件的内容，手工做一个比较大的文本文件：
```
count=0;while [ $count -lt 1048578 ];do dd if=/test/passwd of=/test/bigfile bs=1K count=2 seek=$[$count*2] ; ((count ++));done
du -sh /test/bigfile 
2.0G	/test/bigfile
```

这样我们就有了一个2G左右的文件，等下我们就删除这个文件，再来恢复它的数据。
再删除他之前，我们先记录一些文件的信息，以方便我们后续针对测试进行数据对比，先学习使用一个命令debugfs来查看ext4文件系统的相关信息：
```
debugfs /dev/sdf1 
debugfs 1.42.9 (28-Dec-2013)
debugfs:  ls
 2  (12) .    2  (4084) ..    11  (20) lost+found   
 13  (28) DIR_COLORS.256color    95158273  (24) NetworkManager   
 97779713  (12) X11    19  (16) adjtime    26738689  (20) alternatives   
 21  (20) anacrontab    23  (16) at.deny    45613057  (16) avahi   
 24  (32) bash-command-not-found    25  (16) bashrc   
 26  (24) bg_rsyncd.conf    77332481  (28) bonobo-activation  
 ...... 
```
可以显示出文件的inode编号对应文件名的信息。在其中找到我们的bugfile：189  (1420) bigfile，看到它的inode编号为189。然后使用这个编号来查看文件相关其他信息：
```
debugfs:  stat <189>
Inode: 189   Type: regular    Mode:  0644   Flags: 0x80000
Generation: 1657554558    Version: 0x00000000:00000001
User:     0   Group:     0   Size: 2147471360
File ACL: 0    Directory ACL: 0
Links: 1   Blockcount: 4194288
Fragment:  Address: 0    Number: 0    Size: 0
 ctime: 0x5e5879f8:6d0be5e0 -- Fri Feb 28 10:24:56 2020
 atime: 0x5e5879fc:91493d68 -- Fri Feb 28 10:25:00 2020
 mtime: 0x5e587866:18a0fec4 -- Fri Feb 28 10:18:14 2020
crtime: 0x5e5876d3:34a7eb94 -- Fri Feb 28 10:11:31 2020
Size of extra inode fields: 28
EXTENTS:
(ETB0):34816, (0-32767):184320-217087, (32768-45055):217088-229375, (45056-77823):231424-264191, (77824-108543):26
4192-294911, (108544-141311):296960-329727, (141312-174079):329728-362495, (174080-206847):362496-395263, (206848-
239615):395264-428031, (239616-272383):428032-460799, (272384-305151):460800-493567, (305152-335871):493568-524287
, (335872-368639):557056-589823, (368640-401407):589824-622591, (401408-434175):622592-655359, (434176-466943):655
360-688127, (466944-499711):688128-720895, (499712-524284):720896-745468
```


stat命令可以查看文件inode信息，最后面的EXTENTS标记的内容就是这个文件目前索引的block编号。
```
debugfs:  ex <189>
Level Entries         Logical              Physical Length Flags
 0/ 1   1/  1      0 - 524284     34816             524285
 1/ 1   1/ 17      0 -  32767    184320 -    217087  32768 
 1/ 1   2/ 17  32768 -  45055    217088 -    229375  12288 
 1/ 1   3/ 17  45056 -  77823    231424 -    264191  32768 
 1/ 1   4/ 17  77824 - 108543    264192 -    294911  30720 
 1/ 1   5/ 17 108544 - 141311    296960 -    329727  32768 
 1/ 1   6/ 17 141312 - 174079    329728 -    362495  32768 
 1/ 1   7/ 17 174080 - 206847    362496 -    395263  32768 
 1/ 1   8/ 17 206848 - 239615    395264 -    428031  32768 
 1/ 1   9/ 17 239616 - 272383    428032 -    460799  32768 
 1/ 1  10/ 17 272384 - 305151    460800 -    493567  32768 
 1/ 1  11/ 17 305152 - 335871    493568 -    524287  30720 
 1/ 1  12/ 17 335872 - 368639    557056 -    589823  32768 
 1/ 1  13/ 17 368640 - 401407    589824 -    622591  32768 
 1/ 1  14/ 17 401408 - 434175    622592 -    655359  32768 
 1/ 1  15/ 17 434176 - 466943    655360 -    688127  32768 
 1/ 1  16/ 17 466944 - 499711    688128 -    720895  32768 
 1/ 1  17/ 17 499712 - 524284    720896 -    745468  24573 
```

ex命令可以查看更详细的EXTENTS的映射关系。在此我们先不对EXTENTS信息作详细解释，后续恢复数据的时候我们再说。
```
debugfs:  imap <189>
Inode 189 is part of block group 0
	located at block 1301, offset 0x0c00
```
imap命令可以查看一个inode所在的block位置和其偏移量，就是说，利用这个信息我们就可以找到这个inode在当前磁盘的什么位置，比如这个例子就是：189号inode在当前磁盘的1301个块上再偏移0x0c00字节。那么当前分区一个block多大？一个inode多大呢？
```
debugfs:  stats
Filesystem volume name:   <none>
Last mounted on:          /test
Filesystem UUID:          29434ffa-1987-4379-9ca8-a0cc5d35e2cc
Filesystem magic number:  0xEF53
Filesystem revision #:    1 (dynamic)
Filesystem features:      has_journal ext_attr resize_inode dir_index filetype needs_recovery extent 64bit flex_bg
 sparse_super large_file huge_file uninit_bg dir_nlink extra_isize
Filesystem flags:         signed_directory_hash 
......
Block size:               4096
......
Inode size:	          256
......
```
通过stats命令我们可以查看文件系统的superblock，其中记录了文件系统的属性信息。当前文件系统的block size为4096，inode size为256。
根据以上信息，我们可以将189号inode的二进制数据dump出来：
```
printf %d 0x0c00
3072
dd if=/dev/sdf1 of=$[1301*4096+3072] bs=1 count=256 skip=$[1301*4096+3072]
256+0 records in
256+0 records out
256 bytes (256 B) copied, 0.000271671 s, 942 kB/s\

ls
5331968
```


产生的这个文件就是189号inode的磁盘二进制数据。当然这是未删除文件前的，我们等下再删除文件后建一个新的，以对比删除前后两个inode的变化。
我们回到debugfs命令，然后看一下文件的block内容，以确认文件内容：
```
debugfs:  stat <189>
Inode: 189   Type: regular    Mode:  0644   Flags: 0x80000
Generation: 1657554558    Version: 0x00000000:00000001
User:     0   Group:     0   Size: 2147471360
File ACL: 0    Directory ACL: 0
Links: 1   Blockcount: 4194288
Fragment:  Address: 0    Number: 0    Size: 0
 ctime: 0x5e5879f8:6d0be5e0 -- Fri Feb 28 10:24:56 2020
 atime: 0x5e5879fc:91493d68 -- Fri Feb 28 10:25:00 2020
 mtime: 0x5e587866:18a0fec4 -- Fri Feb 28 10:18:14 2020
crtime: 0x5e5876d3:34a7eb94 -- Fri Feb 28 10:11:31 2020
Size of extra inode fields: 28
EXTENTS:
(ETB0):34816, (0-32767):184320-217087, (32768-45055):217088-229375, (45056-77823):231424-264191, (77824-108543):26
4192-294911, (108544-141311):296960-329727, (141312-174079):329728-362495, (174080-206847):362496-395263, (206848-
239615):395264-428031, (239616-272383):428032-460799, (272384-305151):460800-493567, (305152-335871):493568-524287
, (335872-368639):557056-589823, (368640-401407):589824-622591, (401408-434175):622592-655359, (434176-466943):655
360-688127, (466944-499711):688128-720895, (499712-524284):720896-745468
debugfs:  block_dump 745468
0000  726f 6f74 3a78 3a30 3a30 3a72 6f6f 743a  root:x:0:0:root:
0020  2f72 6f6f 743a 2f62 696e 2f62 6173 680a  /root:/bin/bash.
0040  6269 6e3a 783a 313a 313a 6269 6e3a 2f62  bin:x:1:1:bin:/b
0060  696e 3a2f 7362 696e 2f6e 6f6c 6f67 696e  in:/sbin/nologin
0100  0a64 6165 6d6f 6e3a 783a 323a 323a 6461  .daemon:x:2:2:da
0120  656d 6f6e 3a2f 7362 696e 3a2f 7362 696e  emon:/sbin:/sbin
0140  2f6e 6f6c 6f67 696e 0a61 646d 3a78 3a33  /nologin.adm:x:3
......
```

可以看到，文件对应的block信息确实是passwd的相关数据。
之后，我们可以删除文件了，然后使用debugfs再观察文件信息：

```
rm /test/bigfile
umount /test/                   #保护文件系统不受后续磁盘操作的影响
debugfs /dev/sdf1 
debugfs 1.42.9 (28-Dec-2013)
debugfs:  ls -d
 2  (12) .    2  (4084) ..   <2> (20) DIR_COLORS   
<13> (28) DIR_COLORS.256color   <14> (32) DIR_COLORS.lightbgcolor   
......
<189> (1420) bigfile  
......
```


这时要使用ls -d参数，显示包括已删除文件在内的所有inode信息，其中所有带有<>标示的inode编号都是已经被删除的文件，但此时，仍然可以用debugfs看到对应inode信息。
然后我们继续在debugfs中使用其他命令查看188号inode的信息：
```
debugfs:  stat <189>
Inode: 189   Type: regular    Mode:  0644   Flags: 0x80000
Generation: 1657554558    Version: 0x00000000:00000001
User:     0   Group:     0   Size: 0
File ACL: 0    Directory ACL: 0
Links: 0   Blockcount: 0
Fragment:  Address: 0    Number: 0    Size: 0
 ctime: 0x5e587c0e:ed3f4c64 -- Fri Feb 28 10:33:50 2020
 atime: 0x5e5879fc:91493d68 -- Fri Feb 28 10:25:00 2020
 mtime: 0x5e587c0e:ed3f4c64 -- Fri Feb 28 10:33:50 2020
crtime: 0x5e5876d3:34a7eb94 -- Fri Feb 28 10:11:31 2020
dtime: 0x5e587c0e -- Fri Feb 28 10:33:50 2020
Size of extra inode fields: 28
EXTENTS:
debugfs:  ex <189>
Level Entries       Logical              Physical Length Flags
debugfs:  imap <189>
Inode 189 is part of block group 0
	located at block 1301, offset 0x0c00
```

我们发现，此时inode中数据除了EXTENTS信息没了以外，其他相关信息还能找到。理想情况下，我们刚删除一个文件，在较短时间进行恢复的话，就应该是这样一个状态。于是，我们开始尝试恢复数据，仍然是根据imap信息，先dump出文件的inode进行查看：
```
dd if=/dev/sdf1 of=$[1301*4096+3072].rm bs=1 count=256 skip=$[1301*4096+3072]
256+0 records in
256+0 records out
256 bytes (256 B) copied, 0.000554775 s, 461 kB/s
ls
5331968  5331968.rm
```

此时我们有两个inode数据，一个是文件删除前的，一个是文件删除后的。为了后续我们查看inode内容方便，我们先要补充inode数据结构的相关知识。ext4 inode结构可以在内核源代码目录下的 fs/ext4/ext4.h 文件中找到。我们来看一下：
```
/*
 * Structure of an inode on the disk
 */
struct ext4_inode {
        __le16  i_mode;         /* File mode */
        __le16  i_uid;          /* Low 16 bits of Owner Uid */
        __le32  i_size_lo;      /* Size in bytes */
        __le32  i_atime;        /* Access time */
        __le32  i_ctime;        /* Inode Change time */
        __le32  i_mtime;        /* Modification time */
        __le32  i_dtime;        /* Deletion Time */
        __le16  i_gid;          /* Low 16 bits of Group Id */
        __le16  i_links_count;  /* Links count */
        __le32  i_blocks_lo;    /* Blocks count */
        __le32  i_flags;        /* File flags */
        union {
                struct {
                        __le32  l_i_version;
                } linux1;
                struct {
                        __u32  h_i_translator;
                } hurd1;
                struct {
                        __u32  m_i_reserved1;
                } masix1;
        } osd1;                         /* OS dependent 1 */
        __le32  i_block[EXT4_N_BLOCKS];/* Pointers to blocks */
        __le32  i_generation;   /* File version (for NFS) */
        __le32  i_file_acl_lo;  /* File ACL */
        __le32  i_size_high;
        __le32  i_obso_faddr;   /* Obsoleted fragment address */
        union {
                struct {
......
```

inode结构信息并未显示完整，我们只选取我们当前关注的信息进行学习。在这个结构体中我们可以看到，文件的相关属性信息都在inode中，这里对于数据恢复最重要的是i_block数组，这个数组中有15个元素，记录的是此文件指向的存储文件数据的对应block。在ext2/3文件系统上，这个数组的前12的元素是直接指向存储数据的block，恢复数据可以直接读对应编号的block即可。而13、14、15三个分别为一级、二级、三级间接索引指向，相关概念不在此详述，但是相对比较容易找到对应的block查看相关数据。
而我们目前面对的是ext4，在数据block索引方法上相对ext3有很大变化，主要就是引入了extent机制。我们在此不详述为啥要引入extent，仅从数据恢复的角度来学习extent的结构。那么针对当前这个2G左右的文件，其extent在inode上是怎么布局的呢？可以参考下图：

![1](https://zorrozou.github.io/docs/ext4/1.jpg)

此图引用自： https://zhuanlan.zhihu.com/p/52052278 更细节内容可以查看原文。


在ext4_inode结构中，存储extents相关数据结构的位置实际就是i_block数组所在的位置，因为ext4是使用extent索引磁盘block的，所以直接复用i_block空间即可。extents相关数据结构有三种，所有数据结构原型声明都在内核源代码目录下fs/ext4/ext4_extents.h 文件中，我们来看一下：
```
/*
 * This is the extent on-disk structure.
 * It's used at the bottom of the tree.
 */
struct ext4_extent {
        __le32  ee_block;       /* first logical block extent covers */
        __le16  ee_len;         /* number of blocks covered by extent */
        __le16  ee_start_hi;    /* high 16 bits of physical block */
        __le32  ee_start_lo;    /* low 32 bits of physical block */
};

/*
 * This is index on-disk structure.
 * It's used at all the levels except the bottom.
 */
struct ext4_extent_idx {
        __le32  ei_block;       /* index covers logical blocks from 'block' */
        __le32  ei_leaf_lo;     /* pointer to the physical block of the next *
                                 * level. leaf or next index could be there */
        __le16  ei_leaf_hi;     /* high 16 bits of physical block */
        __u16   ei_unused;
};

/*
 * Each block (leaves and indexes), even inode-stored has header.
 */
struct ext4_extent_header {
        __le16  eh_magic;       /* probably will support different formats */
        __le16  eh_entries;     /* number of valid entries */
        __le16  eh_max;         /* capacity of store in entries */
        __le16  eh_depth;       /* has tree real underlying blocks? */
        __le32  eh_generation;  /* generation of the tree */
};
```


根据途中的索引关系我们可以知道，实际索引block信息的是 ext4_extent 数据结构。因为ext4支持48位块，所以在这个结构中用三个记录了指向的块，其中 ee_start_hi 和 ee_start_lo 两个组合起来记录了48位的物理第一块编号，ee_len 记录了从第一个块之后多少块都是属于这个extent连续数据块。以此可知，因为 ee_len 只有16bit，而且其首个bit被用来标记次extent是否被初始化，所以单独一个ext4_extent最多可以索引的连续块长度为2^15 * 4096(block 长度) = 128M空间。
我们根据inode的内容再来看一下其他数据结构的含义：
```
hexdump -e '"%4_ad |" 8/4 "%12d " "\n"' 5331968
   0 |       33188   2147471360   1582856700   1582856696   1582856294            0        65536      4194288
  32 |      524288            1       127754        65540            0            0        34816       131072
  64 |       32768        12288       217088        45056        32768       231424        77824        30720
  96 |      264192   1657554558            0            0            0            0            0            0
 128 |          28   1829496288    413204164  -1857471128   1582855891    883420052            0            0
 160 |           0            0            0            0            0            0            0            0
*
hexdump -e '"%4_ad |" 8/4 "%12d " "\n"' 5331968.rm 
   0 |       33188            0   1582856700   1582857230   1582857230   1582857230            0            0
  32 |      524288            1        62218            4            0            0        34816       131072
  64 |       32768        12288       217088        45056        32768       231424        77824        30720
  96 |      264192   1657554558            0            0            0            0            0            0
 128 |          28   -314618780   -314618780  -1857471128   1582855891    883420052            0            0
 160 |           0            0            0            0            0            0            0            0
*
```


使用hexdump命令按照每行8个数据每个数据4字节长度来对比看一下文件删除后和删除前的inode信息。根据inode结构我们可以推算出，第40字节数据开始处是i_block存储位置。根据对应数据结构细节和布局图可知，一个ext4_extent_header占12字节，一个ext4_extent_idx占12字节。针对如上描述，可知对应位置每四字节的数据为：
删除后：

ext4_extent_header：

eh_magic + eh_entries（共4字节） = 62218

eh_max + eh_depth（共4字节） = 4

eh_generation（共4字节） = 0

ext4_extent_idx：

ei_block（共4字节）= 0

ei_leaf_lo（共4字节）= 34816

ei_leaf_hi + ei_unused = 131072

删除前：

ext4_extent_header：

eh_magic + eh_entries（共4字节） = 127754

eh_max + eh_depth（共4字节） = 65540

eh_generation（共4字节） = 0

ext4_extent_idx：

ei_block（共4字节）= 0

ei_leaf_lo（共4字节）= 34816

ei_leaf_hi + ei_unused = 131072

对比发现，此inode信息的ext4_extent_idx没有被清除，而ext4_extent_header信息在删除后有被改动。我们丢失了比较关键的eh_depth信息，这个信息记录了这个文件extents树的层级个数，这会影响后续数据恢复的过程。如果知道这个层级个数，恢复会更容易一些，不知道的话就要靠猜测了。
不过针对我们当前这个文件，因为删除前我们备份了inode信息，所以可以找出这个eh_depth层级数为1。
```
hexdump -e '"%4_ad |" 16/2 "%5d " "\n"' 5331968    
   0 |-32348     0 -12288 32767 31228 24152 31224 24152 30822 24152     0     0     0     1   -16    63
  32 |    0     8     1     0 -3318     1     4     1     0     0     0     0 -30720     0     0     2
  64 |-32768     0 12288     0 20480     3 -20480     0 -32768     0 -30720     3 12288     1 30720     0
  96 | 2048     4 18046 25292     0     0     0     0     0     0     0     0     0     0     0     0
 128 |   28     0 -6688 27915  -316  6304 15720 -28343 30419 24152 -5228 13479     0     0     0     0
 160 |    0     0     0     0     0     0     0     0     0     0     0     0     0     0     0     0
*
 hexdump -e '"%4_ad |" 16/2 "%5d " "\n"' 5331968.rm 
   0 |-32348     0     0     0 31228 24152 31758 24152 31758 24152 31758 24152     0     0     0     0
  32 |    0     8     1     0 -3318     0     4     0     0     0     0     0 -30720     0     0     2
  64 |-32768     0 12288     0 20480     3 -20480     0 -32768     0 -30720     3 12288     1 30720     0
  96 | 2048     4 18046 25292     0     0     0     0     0     0     0     0     0     0     0     0
 128 |   28     0 19556 -4801 19556 -4801 15720 -28343 30419 24152 -5228 13479     0     0     0     0
 160 |    0     0     0     0     0     0     0     0     0     0     0     0     0     0     0     0
*
```

显示中对应第二行第八个数字为eh_depth值。可以看到这个值在删除后被清0了。
不过最关键的索引信息在ext4_extent_idx中，ei_leaf_lo的值为34816，不过因为要记录的是48bit块，所以其后面的16bit还可能记录着高16bit的block编号数据。再看hexdump -e '"%4_ad |" 16/2 "%5d " "\n"' 5331968.rm 显示中的第二行倒数第三个数，就是ei_leaf_hi，值为0。意味着34816就是下一级extent结构。所以我们dump出这个块来继续分析：
```
dd if=/dev/sdf1 of=34816 bs=4K count=1 skip=34816
1+0 records in
1+0 records out
4096 bytes (4.1 kB) copied, 0.0252319 s, 162 kB/s
[root@100-66-27-140 /data/home/zorrozou]# hexdump -e '"%4_ad |" 8/4 "%12d " "\n"' 34816 
   0 |     1176330          340            0            0        32768       184320        32768        12288
  32 |      217088        45056        32768       231424        77824        30720       264192       108544
  64 |       32768       296960       141312        32768       329728       174080        32768       362496
  96 |      206848        32768       395264       239616        32768       428032       272384        32768
 128 |      460800       305152        30720       493568       335872        32768       557056       368640
 160 |       32768       589824       401408        32768       622592       434176        32768       655360
 192 |      466944        32768       688128       499712        24573       720896            0            0
 224 |           0            0            0            0            0            0            0            0
*
3200 |           0            0   1705826272        32736   1705826208        32736            0            0
3232 |  1706116375        32736   1706116368        32736   1706116361        32736   1706116353        32736
3264 |           0            0   1706116350        32736            0            0   1706116413        32736
3296 |           0            0            0            0            0            0   1706116342        32736
3328 |  1706116381        32736            0            0   1706116336        32736   1706116329        32736
3360 |  1706116322        32736   1706116314        32736            0            0   1706116311        32736
3392 |           0            0   1706116420        32736            0            0            0            0
3424 |           0            0   1706116303        32736   1706116389        32736            0            0
3456 |  1706116420        32736   1706116413        32736   1706116405        32736   1706116397        32736
3488 |  1706116389        32736   1706116381        32736   1708309936        32736            1            0
3520 |         868            0            1            0          884            0           14            0
3552 |         918            0           12            0         5112            0           13            0
3584 |      288544            0           25            0      2489480            0           27            0
3616 |           8            0           26            0      2489488            0           28            0
3648 |           8            0   1879047925            0   1705820656        32736            5            0
3680 |  1705822424        32736            6            0   1705820912        32736           10            0
3712 |         986            0           11            0           24            0            3            0
3744 |  1708310528        32736            2            0          672            0           20            0
3776 |           7            0           23            0   1705824600        32736            7            0
3808 |  1705823664        32736            8            0          936            0            9            0
3840 |          24            0   1879048190            0         3376            0   1879048191            0
3872 |           2            0   1879048176            0   1705823410        32736   1879048185            0
3904 |          27            0            0            0            0            0            0            0
3936 |           0            0            0            0            0            0            0            0
*
4000 |  1708310824        32736   1708310800        32736   1706196704        32736            0            0
4032 |           0            0   1706128832        32736            0            0   1708310792        32736
4064 |  1702104384        32736            0            0            0            0            0            0
```

因为已知这个文件extent树只有1级，所以我们可以大胆的根据下一级结构对索引的block进行估算。再上图中，这个block内容对应这个布局：

![2](https://zorrozou.github.io/docs/ext4/2.png)

我们猜测上述blcok的hexdump内容在6-12行为有效数据，即偏移量标示为0-224字节内的所有内容。前12个字节为ext4_extent_header信息。使用 hexdump -e '"%4_ad |" 16/2 "%5d " "\n"' 34816 命令可以看到这个header中对应的eh_depth为0，所以12字节后的都是ext4_extent结构，直接指向对应block。ext4_extent中，我们主要关注ee_len、ee_start_hi、ee_start_lo，并且后两个组合在一起表示一个48位block信息。所以我们先用下面这个命令列出所有的ext4_extent中的起始block位置的低32位数字：
```
hexdump -e '"%4_ad |" 3/4 "%12d " "\n"' 34816 | head -20
   0 |     1176330          340            0
  12 |           0        32768       184320
  24 |       32768        12288       217088
  36 |       45056        32768       231424
  48 |       77824        30720       264192
  60 |      108544        32768       296960
  72 |      141312        32768       329728
  84 |      174080        32768       362496
  96 |      206848        32768       395264
 108 |      239616        32768       428032
 120 |      272384        32768       460800
 132 |      305152        30720       493568
 144 |      335872        32768       557056
 156 |      368640        32768       589824
 168 |      401408        32768       622592
 180 |      434176        32768       655360
 192 |      466944        32768       688128
 204 |      499712        24573       720896
 216 |           0            0            0
*
```

以上除第一列偏移字节数以外的第三列数字就是起始block位置的低32位数字。然后我们再列出高16位数字：
```
hexdump -e '"%4_ad |" 6/2 "%12d " "\n"' 34816  | head -20
   0 |       -3318           17          340            0            0            0
  12 |           0            0       -32768            0       -12288            2
  24 |      -32768            0        12288            0        20480            3
  36 |      -20480            0       -32768            0       -30720            3
  48 |       12288            1        30720            0         2048            4
  60 |      -22528            1       -32768            0       -30720            4
  72 |       10240            2       -32768            0         2048            5
  84 |      -22528            2       -32768            0       -30720            5
  96 |       10240            3       -32768            0         2048            6
 108 |      -22528            3       -32768            0       -30720            6
 120 |       10240            4       -32768            0         2048            7
 132 |      -22528            4        30720            0       -30720            7
 144 |        8192            5       -32768            0       -32768            8
 156 |      -24576            5       -32768            0            0            9
 168 |        8192            6       -32768            0       -32768            9
 180 |      -24576            6       -32768            0            0           10
 192 |        8192            7       -32768            0       -32768           10
 204 |      -24576            7        24573            0            0           11
 216 |           0            0            0            0            0            0
*
```


以上除第一列偏移字节数以外的第四列数字就是起始block位置的高16位数字。全是0，就是说目前所有的block编号32bit长度就可以记录了，没用到高16bit，所以我们直接使用32位数字作为每个分段的起始block位置即可。每个分段的连续长度是这里显示的第三列，但是这16bit中，最高一个bit用来标记本extent是否被占用，所以我们只看后15bit。于是碰巧，这列中的数字取绝对值就是这个分片的blocks个数。由此我们可以得出这个文件所有block在磁盘上的覆盖范围，并保存到block_list文件中：
```
cat block_list 
184320 32768
217088 12288
231424 32768
264192 30720
296960 32768
329728 32768
362496 32768
395264 32768
428032 32768
460800 32768
493568 30720
557056 32768
589824 32768
622592 32768
655360 32768
688128 32768
720896 24573
```
第一列为分片起始磁盘block，第二列为这个分片连续的块个数。
使用这个文件的内容恢复文件数据：
```
count=0;cat block_list |while read -a block;do dd if=/dev/sdf1 of=bigfile_restore bs=4K count=${block[1]} skip=${block[0]} seek=$count ;count=$[$count+${block[1]}];done
32768+0 records in
32768+0 records out
134217728 bytes (134 MB) copied, 1.33926 s, 100 MB/s
12288+0 records in
12288+0 records out
50331648 bytes (50 MB) copied, 0.271418 s, 185 MB/s
32768+0 records in
32768+0 records out
......

head bigfile_restore 
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
daemon:x:2:2:daemon:/sbin:/sbin/nologin
adm:x:3:4:adm:/var/adm:/sbin/nologin
lp:x:4:7:lp:/var/spool/lpd:/sbin/nologin
sync:x:5:0:sync:/sbin:/bin/sync
shutdown:x:6:0:shutdown:/sbin:/sbin/shutdown
halt:x:7:0:halt:/sbin:/sbin/halt
mail:x:8:12:mail:/var/spool/mail:/sbin/nologin
operator:x:11:0:operator:/root:/sbin/nologin


tail bigfile_restore 
webdev:x:510:100::/data/webdev:/bin/bash
user_00:x:511:100::/home/user_00:/bin/bash
user_01:x:512:100::/home/user_01:/bin/bash
user_02:x:513:100::/home/user_02:/bin/bash
user_03:x:514:100::/home/user_03:/bin/bash
user_04:x:515:100::/home/user_04:/bin/bash
user_05:x:516:100::/home/user_05:/bin/bash
user_06:x:517:100::/home/user_06:/bin/bash
user_07:x:518:100::/home/user_07:/bin/bash
user


ls -l bigfile_restore
-rw-r--r-- 1 root root 2147471360 Feb 28 12:05 bigfile_restore
```

一个2G大小的文件内容恢复完成。当然，我们在这里选择恢复一个2G大小的文件是有原因的。目前我们发现，文件比较小时侯，inode中的extent可以直接指向extent块，并且在删除文件的时候，这部分extent信息会被清零，导致索引块信息丢失。而有多级索引的extent信息却可以被保留下来，虽然也丢失了部分信息，但是依然可以通过残留的部分信息对文件进行恢复。

## ext4文件系统结构详解

根据上面的例子，我们已经对文件inode的结构和extent索引结构有了一定了解。接下来我们来补充一下ext4整个文件系统的相关知识。

### ext4分区结构

ext4的分区结构布局跟ext3基本没什么变化，结构参见下图：

![3](https://zorrozou.github.io/docs/ext4/3.png)

这里跟ext3有变化的是绿色标记的部分：ext4加入了flex_bg属性，这个属性让文件系统在块组结构之上又多了个flex块组结构。每个flex_bg包含连续的若干个块组，这个功能让之前分散在各个块组中管理的组描述符、块位图、inode位图和inode表等相关metadate信息放在了flex_bg的第一个块组中管理，于是其他块组中基本都是连续的块。
我们可以使用dumpe2fs命令查看ext4文件系统的结构，其中Flex block group size就是一个flex_bg中包含的块组个数：
```
dumpe2fs /dev/sdf1

Filesystem volume name:   <none>
Last mounted on:          /mnt
Filesystem UUID:          29434ffa-1987-4379-9ca8-a0cc5d35e2cc
Filesystem magic number:  0xEF53
Filesystem revision #:    1 (dynamic)
Filesystem features:      has_journal ext_attr resize_inode dir_index filetype extent 64bit flex_bg spar
se_super large_file huge_file uninit_bg dir_nlink extra_isize
Filesystem flags:         signed_directory_hash
Default mount options:    user_xattr acl
Filesystem state:         clean
Errors behavior:          Continue
Filesystem OS type:       Linux
Inode count:              122101760
Block count:              488378390
Reserved block count:     24418919
Free blocks:              423686492
Free inodes:              122089836
First block:              0
Block size:               4096
Fragment size:            4096
Group descriptor size:    64
Reserved GDT blocks:      1024
Blocks per group:         32768
Fragments per group:      32768
Inodes per group:         8192
Inode blocks per group:   512
Flex block group size:    16
Filesystem created:       Fri Feb 28 08:12:25 2020
Last mount time:          Sun Mar  1 11:57:21 2020
Last write time:          Tue Mar  3 21:05:32 2020
Mount count:              5
Maximum mount count:      -1
Last checked:             Fri Feb 28 08:12:25 2020
Check interval:           0 (<none>)
Lifetime writes:          567 GB
Reserved blocks uid:      0 (user root)
Reserved blocks gid:      0 (group root)
First inode:              11
Inode size:               256
Required extra isize:     28
Desired extra isize:      28
Journal inode:            8
Default directory hash:   half_md4
Directory Hash Seed:      e0f5015a-a434-4705-9e20-d0da3d20f10f
Journal backup:           inode blocks
Journal features:         journal_incompat_revoke journal_64bit
Journal size:             128M
Journal length:           32768
Journal sequence:         0x00001a0d
Journal start:            0


Group 0: (Blocks 0-32767) [ITABLE_ZEROED]
  Checksum 0x1bcb, unused inodes 7904
  Primary superblock at 0, Group descriptors at 1-233
  Reserved GDT blocks at 234-1257
  Block bitmap at 1258 (+1258), Inode bitmap at 1274 (+1274)
  Inode table at 1290-1801 (+1290)
  23278 free blocks, 7910 free inodes, 2 directories, 7904 unused inodes
  Free blocks: 9490-32767
  Free inodes: 188-190, 286-8192
Group 1: (Blocks 32768-65535) [INODE_UNINIT, ITABLE_ZEROED]
  Checksum 0xd88f, unused inodes 8192
  Backup superblock at 32768, Group descriptors at 32769-33001
  Reserved GDT blocks at 33002-34025
  Block bitmap at 1259 (bg #0 + 1259), Inode bitmap at 1275 (bg #0 + 1275)
  Inode table at 1802-2313 (bg #0 + 1802)
  417 free blocks, 8192 free inodes, 0 directories, 8192 unused inodes
  Free blocks: 34174, 34400-34815
  Free inodes: 8193-16384
Group 2: (Blocks 65536-98303) [INODE_UNINIT, ITABLE_ZEROED]
  Checksum 0x191f, unused inodes 8192
  Block bitmap at 1260 (bg #0 + 1260), Inode bitmap at 1276 (bg #0 + 1276)
  Inode table at 2314-2825 (bg #0 + 2314)
  0 free blocks, 8192 free inodes, 0 directories, 8192 unused inodes
  Free blocks:
  Free inodes: 16385-24576
Group 3: (Blocks 98304-131071) [INODE_UNINIT, ITABLE_ZEROED]
  Checksum 0x32b4, unused inodes 8192
  Backup superblock at 98304, Group descriptors at 98305-98537
  Reserved GDT blocks at 98538-99561
  Block bitmap at 1261 (bg #0 + 1261), Inode bitmap at 1277 (bg #0 + 1277)
  Inode table at 2826-3337 (bg #0 + 2826)
  790 free blocks, 8192 free inodes, 0 directories, 8192 unused inodes
  Free blocks: 99562-100351
  Free inodes: 24577-32768
  ......
```

超级块（superblock）：

就是我们在dumpefs现实中看到的前些行块组信息以外的内容。记录了整个文件系统的块大小、inode大小、块、inode个数、日志块等关键属性信息。

组描述符（Group descriptors）：

存储了本块组内相关块的位置，比如块位图、inode位图、inode table等。内核中相关结构体定义如下：
```
/*
 * Structure of a blocks group descriptor
 */
struct ext4_group_desc
{
        __le32  bg_block_bitmap_lo;     /* Blocks bitmap block */
        __le32  bg_inode_bitmap_lo;     /* Inodes bitmap block */
        __le32  bg_inode_table_lo;      /* Inodes table block */
        __le16  bg_free_blocks_count_lo;/* Free blocks count */
        __le16  bg_free_inodes_count_lo;/* Free inodes count */
        __le16  bg_used_dirs_count_lo;  /* Directories count */
        __le16  bg_flags;               /* EXT4_BG_flags (INODE_UNINIT, etc) */
        __le32  bg_exclude_bitmap_lo;   /* Exclude bitmap for snapshots */
        __le16  bg_block_bitmap_csum_lo;/* crc32c(s_uuid+grp_num+bbitmap) LE */
        __le16  bg_inode_bitmap_csum_lo;/* crc32c(s_uuid+grp_num+ibitmap) LE */
        __le16  bg_itable_unused_lo;    /* Unused inodes count */
        __le16  bg_checksum;            /* crc16(sb_uuid+group+desc) */
        __le32  bg_block_bitmap_hi;     /* Blocks bitmap block MSB */
        __le32  bg_inode_bitmap_hi;     /* Inodes bitmap block MSB */
        __le32  bg_inode_table_hi;      /* Inodes table block MSB */
        __le16  bg_free_blocks_count_hi;/* Free blocks count MSB */
        __le16  bg_free_inodes_count_hi;/* Free inodes count MSB */
        __le16  bg_used_dirs_count_hi;  /* Directories count MSB */
        __le16  bg_itable_unused_hi;    /* Unused inodes count MSB */
        __le32  bg_exclude_bitmap_hi;   /* Exclude bitmap block MSB */
        __le16  bg_block_bitmap_csum_hi;/* crc32c(s_uuid+grp_num+bbitmap) BE */
        __le16  bg_inode_bitmap_csum_hi;/* crc32c(s_uuid+grp_num+ibitmap) BE */
        __u32   bg_reserved;
};
```

保留的全局描述符表（Reserved GDT）：

这部分空间一般用来给文件系统进行空间拓展的时候使用。当空间拓展的时候，由于新空间的加入可能导致组描述变大，用这部分空间进行扩展。

块位图（Block bitmap）：

用位图方式标记每一个块是否被占用。

inode位图（Inode bitmap）：

用位图方式标记每一个inode是否被占用。

inode表（Inode table）：

用来存放所有inode，每个inode在当前文件系统上是256字节。在超级块中的Inode size记录每一个inode大小。

在ext4文件系统上，以上数据结构在flex_bg中是集中存放在第一个块组中的。其余块组中可以不用记录相关信息，都集中存放block。在ext3上相关信息是分散在每一个块组中。

### ext4目录结构

当我们mount一个ext4文件系统的时候，此文件系统的第一个inode会跟要要挂载的目录inode编号进行关联。而目录的inode中索引的block存放这个目录的目录项信息。每一个目录项纪录了下一级目录或文件的inode编号，于是就可以遍历到文件系统中所有的目录和文件。
我们可以在挂载文件系统前后来观察对应挂载目录的inode编号变化：
```
ls -id /mnt/
917505 /mnt/

mount /dev/sdf1 /mnt
ls -id /mnt/
2 /mnt/
```

挂载前，mnt目录的inode编号为917505。挂载一个分区之后，对应的inode编号变为2。对于一个ext4文件系统来说，第一个inode编号总为2。我们可以通过debugfs命令来查看其相关信息：
```
debugfs /dev/sdf1
debugfs 1.42.9 (28-Dec-2013)
debugfs:  stat <2>
Inode: 2   Type: directory    Mode:  0755   Flags: 0x81000
Generation: 0    Version: 0x00000000:00002c7b
User:     0   Group:     0   Size: 12288
File ACL: 0    Directory ACL: 0
Links: 104   Blockcount: 24
Fragment:  Address: 0    Number: 0    Size: 0
 ctime: 0x5e6b2df0:e11f2ff8 -- Fri Mar 13 14:53:36 2020
 atime: 0x5e5e3c3d:d23c6030 -- Tue Mar  3 19:15:09 2020
 mtime: 0x5e6b2df0:e11f2ff8 -- Fri Mar 13 14:53:36 2020
crtime: 0x5e585aeb:00000000 -- Fri Feb 28 08:12:27 2020
Size of extra inode fields: 28
EXTENTS:
(0):9482, (1-2):9488-9489
debugfs:
```

从extent信息中我们可以看到，这个inode的Flags为0x81000，表示其使用了dir_index方式存储目录项。所以我们不能再以直接查看9482块的内容方式查看其目录项。先通过htree，命令查看其index结构：
```
debugfs:  htree <2>
Root node dump:
	 Reserved zero: 0
	 Hash Version: 1
	 Info length: 8
	 Indirect levels: 0
	 Flags: 0
Number of entries (count): 2
Number of entries (limit): 508
Entry #0: Hash 0x00000000, block 1
Entry #1: Hash 0x8de2fd4e, block 2

Entry #0: Hash 0x00000000, block 1
Reading directory block 1, phys 9488
11 0x20353058-89026648 (20) lost+found
14 0x5e93248e-827623e1 (32) DIR_COLORS.lightbgcolor
15 0x766fabb2-a611f5e9 (20) GREP_COLORS
16 0x3dd382c6-f2d0a8d1 (20) GeoIP.conf
17 0x775935ca-74b556d6 (28) GeoIP.conf.default
18 0x4414754a-d84f5e38 (16) HOSTNAME
90701825 0x6082fbf0-e119f11f (24) NetworkManager
19 0x7fb61d88-e242ff5d (16) adjtime
37748737 0x4c1eb84c-a6b9ab3f (20) alternatives
21 0x2b0243ee-25248d91 (20) anacrontab   23 0x354a6afa-558b7be2 (16) at.deny
20447233 0x83c6c248-aae4a677 (16) audisp
104595457 0x399cda3a-dbfc005d (16) audit
26 0x8c960154-b5fbf07f (24) bg_rsyncd.conf
74973185 0x770e82b8-0447d0a1 (16) binfmt.d
27 0x800cc36c-14ebb931 (24) centos-release
28 0x03387d80-f60cbd8b (24) cgconfig.conf
22020097 0x48562f10-d9514c4c (20) cgconfig.d
29 0x6c7c6f24-6179a0d5 (20) cgrules.conf
30 0x0a6837ca-5ce16cab (36) cgsnapshot_blacklist.conf
60555265 0x5daa8af2-850f21ea (20) chkconfig.d
31 0x4954f0ce-b4d1c6f0 (32) command-not-found.json
32 0x23c009ba-5df41673 (20) conman.conf
33 0x14e0d092-586275d7 (20) cron.deny
56623105 0x6807f248-87fac77b (20) cron.monthly
34 0x69ff30ec-7aa761fb (16) crontab   35 0x71fd63d2-dfab0e24 (16) crypttab
113246209 0x82140724-2ca1443f (20) dnsmasq.d
.......
```
由于其用了dir_index，其第一个block变成了index_block。第一个block是9482。我们查看这个block内容：
```
debugfs:  block_dump 9482
0000  0200 0000 0c00 0102 2e00 0000 0200 0000  ................
0020  f40f 0202 2e2e 0000 0000 0000 0108 0000  ................
0040  fc01 0200 0100 0000 4efd e28d 0200 0000  ........N.......
.......
```

这个块起始于一个dx_root结构体，相关代码在内核源代码 fs/ext4/namei.c 文件中，定义为：
```
struct fake_dirent
{
        __le32 inode;
        __le16 rec_len;
        u8 name_len;
        u8 file_type;
};

struct dx_entry
{
        __le32 hash;
        __le32 block;
};
struct dx_root
{
        struct fake_dirent dot;
        char dot_name[4];
        struct fake_dirent dotdot;
        char dotdot_name[4];
        struct dx_root_info
        {
                __le32 reserved_zero;
                u8 hash_version;
                u8 info_length; /* 8 */
                u8 indirect_levels;
                u8 unused_flags;
        }
        info;
        struct dx_entry entries[0];
};
```

本目录的dx_entry管理了2个block，一共需要16个字节的内容，block内容的第三行就是dx_entry存储开始的位置：

fc01 0200 ：hash值

0100 0000 ：block编号

4efd e28d ：hash值

0200 0000 ：block编号

这个block后续内容已经废弃，所以不用继续看了。dx_root各个字段大家可以参照结构体内容分别对应研究一下，此处不在过多讲解。

这里要额外说明的是，dir_index功能会在目录索引的block超过一个之后默认开启，其目的是为了在目录下存放的文件或者子目录过多的时候以hash的方式加快block索引速度。这样要比直接线性存放目录项的索引速度要快，目录下的文件越多，效果比线性存放目录项越好。

之后，对应的下一级文件或目录名就会以hash的方法分别放在另外两个块中。我们看一下其中一个block的内容：
```
debugfs:  block_dump 9488
0000  0b00 0000 1400 0a02 6c6f 7374 2b66 6f75  ........lost+fou
0020  6e64 0000 0e00 0000 2000 1701 4449 525f  nd...... ...DIR_
0040  434f 4c4f 5253 2e6c 6967 6874 6267 636f  COLORS.lightbgco
0060  6c6f 7200 0f00 0000 1400 0b01 4752 4550  lor.........GREP
0100  5f43 4f4c 4f52 5300 1000 0000 1400 0a01  _COLORS.........
0120  4765 6f49 502e 636f 6e66 0000 1100 0000  GeoIP.conf......
0140  1c00 1201 4765 6f49 502e 636f 6e66 2e64  ....GeoIP.conf.d
0160  6566 6175 6c74 0000 1200 0000 1000 0801  efault..........
0200  484f 5354 4e41 4d45 0100 6805 1800 0e02  HOSTNAME..h.....
0220  4e65 7477 6f72 6b4d 616e 6167 6572 0000  NetworkManager..
0240  1300 0000 1000 0701 6164 6a74 696d 6500  ........adjtime.
0260  0100 4002 1400 0c02 616c 7465 726e 6174  ..@.....alternat
0300  6976 6573 1500 0000 1400 0a01 616e 6163  ives........anac
......
```

这时block中存放的就是目录项的内容。每个单独的目录项结构如下：
```
/*
 * The new version of the directory entry.  Since EXT4 structures are
 * stored in intel byte order, and the name_len field could never be
 * bigger than 255 chars, it's safe to reclaim the extra byte for the
 * file_type field.
 */
struct ext4_dir_entry_2 {
        __le32  inode;                  /* Inode number */
        __le16  rec_len;                /* Directory entry length */
        __u8    name_len;               /* Name length */
        __u8    file_type;
        char    name[EXT4_NAME_LEN];    /* File name */
};
```

block最开始记录了lost+found的目录项，注意其子节序为intel byte，是小端字节序。分析其内容可知：

0b00 0000：inode编号，11。

1400 ：目录项长度，20字节。

0a：目录名长度，10字节。

02 ：文件类型，2表示目录，1表示普通文件。

后续就是文件/目录名的字符串存放位置。此处要注意的是，每个目录项都会按照4字节对齐，所以名字字符串后面还可能有0填充对齐。

后续的文件名我们就不挨个分析了。如果没启用dir_index的话，inode索引block的内容直接线性存放的这种的结构。

### 目录项的删除特性

我们来删除一个目录，来观察一下目录的inode信息变化。我们想要操作分区上的yum目录。其inode编号为：
```
ls -id /mnt/yum/
119275521 /mnt/yum/
```

查看其inode的结构内容：
```
echo "stat <119275521>" | debugfs /dev/sdf1
debugfs 1.42.9 (28-Dec-2013)
debugfs:  stat <119275521>
Inode: 119275521   Type: directory    Mode:  0755   Flags: 0x80000
Generation: 657829489    Version: 0x00000000:00000008
User:     0   Group:     0   Size: 4096
File ACL: 0    Directory ACL: 0
Links: 6   Blockcount: 8
Fragment:  Address: 0    Number: 0    Size: 0
 ctime: 0x5e6b3eae:64c1907c -- Fri Mar 13 16:05:02 2020
 atime: 0x5e6c545a:278a4a0c -- Sat Mar 14 11:49:46 2020
 mtime: 0x5e6b3eae:64c1907c -- Fri Mar 13 16:05:02 2020
crtime: 0x5e6b3eae:60f1007c -- Fri Mar 13 16:05:02 2020
Size of extra inode fields: 28
EXTENTS:
(0):477110304

echo "imap <119275521>" | debugfs /dev/sdf1
debugfs 1.42.9 (28-Dec-2013)
debugfs:  imap <119275521>
Inode 119275521 is part of block group 14560
	located at block 477102112, offset 0x0000
 
dd if=/dev/sdf1 of=inode_119275521 bs=1 count=256 skip=$[477102112*4096]
256+0 records in
256+0 records out
256 bytes (256 B) copied, 0.000280918 s, 911 kB/s

 hexdump -e '3/4 "%12u" "\n"' inode_119275521
       16877        4096  1584157786
  1584086702  1584086702           0
      393216           8      524288
           8      127754           4
           0           0           1
   477110304           0           0
           0           0           0
*
           0   657829489           0
           0           0           0
           0           0          28
  1690407036  1690407036   663374348
  1584086702  1626407036           0
           0           0           0
*
           0
```

我们观察到，这个目录因为内容比较少，所以只占用了一个block，所以flags显示并没启用dir_index。inode中也直接记录了其索引的block编号。我们删除这个目录再来观察一下inode内容：
```
rm -rf /mnt/yum
[root@100-66-27-140 /data/home/zorrozou]# dd if=/dev/sdf1 of=inode_119275521.rm bs=1 count=256 skip=$[477102112*4096]
256+0 records in
256+0 records out
256 bytes (256 B) copied, 0.000267636 s, 957 kB/s
[root@100-66-27-140 /data/home/zorrozou]# hexdump -e '3/4 "%12u" "\n"' inode_119275521.rm
       16877           0  1584157786
  1584158264  1584158264  1584158264
           0           0      524288
          16       62218           4
           0           0           0
*
           0   657829489           0
           0           0           0
           0           0          28
  2650872228  2650872228   663374348
  1584086702  1626407036           0
           0           0           0
*
           0
```
inode中的block编号纪录已经被删除。我们创建一个内容比较多的目录，尽量让其占用很多的block，再来看看效果：
```
for i in `seq 1 10000`;do cp /mnt/pam.d/passwd /mnt/pam.d/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_$i;done

ls -id /mnt/pam.d/
87687169 /mnt/pam.d/

echo "stat <87687169>" | debugfs /dev/sdf1
debugfs 1.42.9 (28-Dec-2013)
debugfs:  stat <87687169>
Inode: 87687169   Type: directory    Mode:  0755   Flags: 0x81000
Generation: 657828295    Version: 0x00000000:00002731
User:     0   Group:     0   Size: 1970176
File ACL: 0    Directory ACL: 0
Links: 2   Blockcount: 3848
Fragment:  Address: 0    Number: 0    Size: 0
 ctime: 0x5e6c574c:bb4fe7d0 -- Sat Mar 14 12:02:20 2020
 atime: 0x5e6c56b5:666f7544 -- Sat Mar 14 11:59:49 2020
 mtime: 0x5e6c574c:bb4fe7d0 -- Sat Mar 14 12:02:20 2020
crtime: 0x5e6b3ead:ded39088 -- Fri Mar 13 16:05:01 2020
Size of extra inode fields: 28
EXTENTS:
(0-480):350756896-350757376

echo "imap <87687169>" | debugfs /dev/sdf1
debugfs 1.42.9 (28-Dec-2013)
debugfs:  imap <87687169>
Inode 87687169 is part of block group 10704
	located at block 350748704, offset 0x0000

dd if=/dev/sdf1 of=inode_87687169 bs=1 count=256 skip=$[350748704*4096]
256+0 records in
256+0 records out
256 bytes (256 B) copied, 0.000270948 s, 945 kB/s

hexdump -e '3/4 "%12u" "\n"' inode_87687169
       16877     1970176  1584158389
  1584158540  1584158540           0
      131072        3848      528384
       10033      127754           4
           0           0         481
   350756896           0           0
           0           0           0
*
           0   657828295           0
           0           0           0
           0           0          28
  3142576080  3142576080  1718580548
  1584086701  3738407048           0
           0           0           0
*
           0
```

此时目录已经启用了dir_index，观察inode信息，我们发现虽然其一共索引了480个block，但inode中只纪录了第一个block，其他block都是由第一个block中记录的hash tree进行索引的。我们删除这个目录再观察：
```
rm -rf /mnt/pam.d/

dd if=/dev/sdf1 of=inode_87687169.rm bs=1 count=256 skip=$[350748704*4096]
256+0 records in
256+0 records out
256 bytes (256 B) copied, 0.000257484 s, 994 kB/s

hexdump -e '3/4 "%12u" "\n"' inode_87687169.rm
       16877           0  1584158890
  1584158890  1584158890  1584158890
           0           0      528384
       20066       62218           4
           0           0           0
*
           0   657828295           0
           0           0           0
           0           0          28
  2798224204  2798224204  2238224208
  1584086701  3738407048           0
           0           0           0
*
           0
```
第一个block的索引已经在删除之后被清除了。从这个实验可以看出来，我们是无法通过inode相关信息恢复目录相关信息的。即使找到第一个块，也无法通过其hash tree恢复相关内容，因为hash tree里只有逻辑块编号，并没有物理块编号。

对于ext4系统来说，我们基本无法通过inode和dir_index相关索引信息恢复目录树结构。

### ext4文件结构

通过目录的每一级索引，就可以遍历到文件系统上所有文件的inode编号，进而找到对应的inode信息。我们已经知道inode中索引了相关block信息，于是整个文件系统所存储的数据就这样组织起来了。

我们通过开头的实验已经大概知道inode中如何索引的block，但那是对一个2G的大文件。如果文件比较小，那么其extent的索引结构相对比较简单。我们知道inode中存放i_block索引的数组元素个数是15个，每个是一个int，所以一共有60字节的长度可以用来存放extent相关数据结构。对于小文件的情况，起索引结构如下图：

![4](https://zorrozou.github.io/docs/ext4/4.png)


每个ext4_extent_header和ext4_extent结构都是12字节。所以这部分最多可以存4个ext4_extent索引，每个ext4_extent最多可以索引32768个连续的block。所以理论上，通过inode直接索引的文件大小最大可以达到512M长度。但是现实使用的情况下，磁盘上一般都不会有那么多连续的块分配给文件，所以大多数文件都到不了这么长，只要占用的ext4_extent结构超过4个，就会产生分级的extent进行更多的块索引。
如果是这种小文件inode直接索引block，在文件被删除的时候，inode中的extent数据结构都会被清零。所以，这种直接索引的文件，也无法通过inode中残留的信息找回相关数据。

以上是普通的文本文件的inode结构。Linux中文件类型除了目录和普通文件以外，还包括符号连接、块设备、字符设备、管道文件和socket文件。这些特殊类型文件大多数不会通过extnet索引块纪录相关信息，相关信息都直接被记录在inode中。比如符号连接，因为它只是纪录了到其指向文件的路径，所以其路径信息会直接记录在i_block数组中。我们可以通过以下命令来查看符号连接的inode内容：
```
ls -i /mnt/mtab
102 /mnt/mtab

echo "stat <102>" | debugfs /dev/sdf1
debugfs 1.42.9 (28-Dec-2013)
debugfs:  stat <102>
Inode: 102   Type: symlink    Mode:  0777   Flags: 0x0
Generation: 657828240    Version: 0x00000000:00000001
User:     0   Group:     0   Size: 17
File ACL: 0    Directory ACL: 0
Links: 1   Blockcount: 0
Fragment:  Address: 0    Number: 0    Size: 0
 ctime: 0x5e6b3ead:d63e4c88 -- Fri Mar 13 16:05:01 2020
 atime: 0x5e6b4327:21a882e8 -- Fri Mar 13 16:24:07 2020
 mtime: 0x5e6b3ead:d63e4c88 -- Fri Mar 13 16:05:01 2020
crtime: 0x5e6b3ead:d63e4c88 -- Fri Mar 13 16:05:01 2020
Size of extra inode fields: 28
Fast_link_dest: /proc/self/mounts
echo "imap <102>" | debugfs /dev/sdf1
debugfs 1.42.9 (28-Dec-2013)
debugfs:  imap <102>
Inode 102 is part of block group 0
	located at block 1296, offset 0x0500

dd if=/dev/sdf1 of=inode_102 bs=1 count=256 skip=$[1296*4096+1280]
256+0 records in
256+0 records out
256 bytes (256 B) copied, 0.000263532 s, 971 kB/s

hexdump -C inode_102
00000000  ff a1 00 00 11 00 00 00  27 43 6b 5e ad 3e 6b 5e  |........'Ck^.>k^|
00000010  ad 3e 6b 5e 00 00 00 00  00 00 01 00 00 00 00 00  |.>k^............|
00000020  00 00 00 00 01 00 00 00  2f 70 72 6f 63 2f 73 65  |......../proc/se|
00000030  6c 66 2f 6d 6f 75 6e 74  73 00 00 00 00 00 00 00  |lf/mounts.......|
00000040  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  |................|
*
00000060  00 00 00 00 90 a9 35 27  00 00 00 00 00 00 00 00  |......5'........|
00000070  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  |................|
00000080  1c 00 00 00 88 4c 3e d6  88 4c 3e d6 e8 82 a8 21  |.....L>..L>....!|
00000090  ad 3e 6b 5e 88 4c 3e d6  00 00 00 00 00 00 00 00  |.>k^.L>.........|
000000a0  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  |................|
*
00000100
```

除非符号连接中记录的文件路径在i_block数组位置中记录不下了，才会索引一个块来记录相关内容。其他特殊文件机制类似，而这种文件在删除的时候，inode中的数据会像小文件一样被清0，所以我们也无法通过同样的思路恢复这些特殊类型文件。

## 最后

至此，我们通过一个文件的数据恢复的实例对ext4文件系统的整体结构做了介绍。并介绍了通过文件系统结构和inode结构恢复数据的原理。但这种数据恢复思路依然有其局限性，比如小文件无法恢复、特殊文件无法恢复、目录树结构无法恢复。在有数据持续写入的情况下，被误删除的大文件索引的block也有可能被其他数据覆盖，所以实际在恢复数据的过程中会因这种情况导致数据恢复不完整。我们还可以通过对文件系统块进行全部扫描的方式，来通过文件头部的特征码找到部分占用1个block以内的小文件进行恢复。

数据恢复技术是一个复杂的技术，在实际的恢复过程中会遇到各种各样的问题。希望本文可以通过ext4文件系统的结构视角对理解数据恢复技术有一定帮助。
