# Socket缓存究竟如何影响TCP的性能？

-------------------------------------------------------------------------------------

版权声明：

本文章内容在非商业使用前提下可无需授权任意转载、发布。

转载、发布请务必注明作者和其微博、微信公众号地址，以便读者询问问题和甄误反馈，共同进步。

微博：
[https://weibo.com/orroz/](https://weibo.com/orroz)

博客：
[https://zorrozou.github.io/](https://zorrozou.github.io/)

微信公众号：**Linux系统技术**

-------------------------------------------------------------------------------------

## 前言

一直以来我们都知道socket的缓存会对tcp性能产生影响，也有无数文章告诉我们应该调大socke缓存。但是究竟调多大？什么时候调？有哪些手段调？具体影响究竟如何？这些问题似乎也没有人真正说明白。下面我们就构建起一个简单的实验环境，在两台虚拟机之间探究一下Socket缓存究竟如何影响TCP的性能？对分析过程不感兴趣的可以直接看最后的结论。

## 影响Socket缓存的参数

首先，我们要先来列出Linux中可以影响Socket缓存的调整参数。在proc目录下，它们的路径和对应说明为：

/proc/sys/net/core/rmem_default

/proc/sys/net/core/rmem_max

/proc/sys/net/core/wmem_default

/proc/sys/net/core/wmem_max

这些文件用来设置所有socket的发送和接收缓存大小，所以既影响TCP，也影响UDP。

针对UDP：

这些参数实际的作用跟 SO_RCVBUF 和 SO_SNDBUF 的 socket option 相关。如果我们不用setsockopt去更改创建出来的 socket  buffer 长度的话，那么就使用 rmem_default 和 wmem_default 来作为默认的接收和发送的 socket buffer 长度。如果修改这些socket option的话，那么他们可以修改的上限是由 rmem_max 和 wmem_max 来限定的。

针对TCP：

除了以上四个文件的影响外，还包括如下文件：

 /proc/sys/net/ipv4/tcp_rmem

/proc/sys/net/ipv4/tcp_wmem

对于TCP来说，上面core目录下的四个文件的作用效果一样，只是默认值不再是 rmem_default 和 wmem_default ，而是由 tcp_rmem 和 tcp_wmem 文件中所显示的第二个值决定。通过setsockopt可以调整的最大值依然由rmem_max和wmem_max限制。

查看tcp_rmem和tcp_wmem的文件内容会发现，文件中包含三个值：

```
[root@localhost network_turning]# cat /proc/sys/net/ipv4/tcp_rmem
4096	131072	6291456
[root@localhost network_turning]# cat /proc/sys/net/ipv4/tcp_wmem
4096	16384	4194304
```

三个值依次表示：min    default    max

min：决定 tcp socket buffer 最小长度。

default：决定其默认长度。

max：决定其最大长度。在一个tcp链接中，对应的buffer长度将在min和max之间变化。导致变化的主要因素是当前内存压力。如果使用setsockopt设置了对应buffer长度的话，这个值将被忽略。相当于关闭了tcp buffer的动态调整。

/proc/sys/net/ipv4/tcp_moderate_rcvbuf

这个文件是服务器是否支持缓存动态调整的开关，1为默认值打开，0为关闭。

另外要注意的是，使用 setsockopt 设置对应buffer长度的时候，实际生效的值将是设置值的2倍。

当然，这里面所有的rmem都是针对接收缓存的限制，而wmem都是针对发送缓存的限制。

我们目前的实验环境配置都采用默认值：

```
[root@localhost network_turning]# cat /proc/sys/net/core/rmem_default
212992
[root@localhost network_turning]# cat /proc/sys/net/core/rmem_max
212992
[root@localhost network_turning]# cat /proc/sys/net/core/wmem_default
212992
[root@localhost network_turning]# cat /proc/sys/net/core/wmem_max
212992
```

另外需要说明的是，我们目前的实验环境是两台虚拟机，一个是centos 8，另一个是fedora 31：

```
[root@localhost network_turning]# uname -r
5.5.15-200.fc31.x86_64
```

```
[root@localhost zorro]# uname -r
4.18.0-147.5.1.el8_1.x86_64
```

我们将要做的测试也很简单，我们将在centos 8上开启一个web服务，并共享一个bigfile。然后在fedora 31上去下载这个文件。通过下载的速度来观察socket缓存对tcp的性能影响。我们先来做一下基准测试，当前在默认设置下，下载速度为：

```
[root@localhost zorro]# wget --no-proxy http://192.168.247.129/bigfile
--2020-04-13 14:01:33--  http://192.168.247.129/bigfile
Connecting to 192.168.247.129:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1073741824 (1.0G)
Saving to: 'bigfile'

bigfile                   100%[=====================================>]   1.00G   337MB/s    in 3.0s

2020-04-13 14:01:36 (337 MB/s) - 'bigfile' saved [1073741824/1073741824]
```

bigfile是个1G的文件，在同一个宿主机的两个虚拟机之间，他们的传输速率达到了337MB/s。这是当前基准环境状态。影响虚拟机之间的带宽的因素较多，我们希望在测试过程中尽量避免其他因素干扰。所以这里我们打算对web服务器的80端口进行限速。为了不影响其他进程的速率，我们使用htb进行限速，脚本如下：

```
[root@localhost zorro]# cat htb.sh
#!/bin/bash

tc qd del dev ens33 root
tc qd add dev ens33 root handle 1: htb default 100
tc cl add dev ens33 parent 1: classid 1:1 htb rate 20000mbit burst 20k
tc cl add dev ens33 parent 1:1 classid 1:10 htb rate 1000mbit burst 20k
tc cl add dev ens33 parent 1:1 classid 1:100 htb rate 20000mbit burst 20k

tc qd add dev ens33 parent 1:10 handle 10: fq_codel
tc qd add dev ens33 parent 1:100 handle 100: fq_codel

tc fi add dev ens33 protocol ip parent 1:0 prio 1 u32 match ip sport 80 0xffff flowid 1:10
```

使用htb给网络流量做了2个分类，针对80端口的流量限制了1000mbit/s的速率限制，其他端口是20000mbit/s的限制，这在当前环境下相当于没有限速。之后，我们在centos 8的web服务器上执行此脚本并在fedora 31上测试下载速率：

```
[root@localhost zorro]# wget --no-proxy http://192.168.247.129/bigfile
--2020-04-13 14:13:38--  http://192.168.247.129/bigfile
Connecting to 192.168.247.129:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1073741824 (1.0G)
Saving to: 'bigfile'

bigfile                   100%[=====================================>]   1.00G  91.6MB/s    in 11s

2020-04-13 14:13:49 (91.7 MB/s) - 'bigfile' saved [1073741824/1073741824]
```

1000mbit的速率限制基本符合要求。

那么问题来了，此时socket缓存在这个1000mbit的带宽限制下，对tcp的传输性能有什么影响呢？

如果你喜欢折腾的话，你可以在这个环境上分别调大调小客户端和服务端的缓存大小来分别测试一下，你会发现，此时对socket的缓存大小做任何调整，似乎对tcp的传输效率都没有什么影响。

所以这里我们需要先分析一下，socket缓存大小到底在什么情况下会对tcp性能有影响？

## 缓存对读写性能的影响

这其实是个通用问题：缓存到底在什么情况下会影响读写性能？

答案也很简单：在读写的相关环节之间有较大的性能差距时，缓存会有比较大的影响。比如，进程要把数据写到硬盘里。因为硬盘写的速度很慢，而内存很快，所以可以先把数据写到内存里，然后应用程度写操作就很快返回，应用程序此时觉得很快写完了。后续这些数据将由内核帮助应用把数据从内存再写到硬盘里。

无论如何，当写操作产生数据的速度，大于实际要接受数据的速度时，buffer才有意义。

在我们当前的测试环境中，数据下载时，web服务器是数据发送方，客户端是数据接收方，中间通过虚拟机的网络传输。在计算机上，一般原则上讲，读数据的速率要快于写数据的速率。所以此时两个虚拟机之间并没有写速率大于度速率的问题。所以此时，调整socket缓存对tcp基本不存在性能影响。

那么如何才能让我们的模型产生影响呢？

答案也很简单，给网络加比较大的延时就可以了。如果我们把每个tcp包的传输过程当作一次写操作的话，那么网络延时变大将导致写操作的处理速度变长。网络就会成为应用程序写速度的瓶颈。我们给我们的80端口再加入一个200ms的延时：

```
[root@localhost zorro]# cat htb.sh
#!/bin/bash

tc qd del dev ens33 root
tc qd add dev ens33 root handle 1: htb default 100
tc cl add dev ens33 parent 1: classid 1:1 htb rate 20000mbit burst 20k
tc cl add dev ens33 parent 1:1 classid 1:10 htb rate 1000mbit burst 20k
tc cl add dev ens33 parent 1:1 classid 1:100 htb rate 20000mbit burst 20k

tc qd add dev ens33 parent 1:10 handle 10: netem delay 200ms
tc qd add dev ens33 parent 1:100 handle 100: fq_codel

tc fi add dev ens33 protocol ip parent 1:0 prio 1 u32 match ip sport 80 0xffff flowid 1:10
```

再次在web服务器上执行此脚本，在客户端fedora 31上在延时前后使用httping测量一下rtt时间：

```
[root@localhost zorro]# httping 192.168.247.129
PING 192.168.247.129:80 (/):
connected to 192.168.247.129:80 (426 bytes), seq=0 time= 17.37 ms
connected to 192.168.247.129:80 (426 bytes), seq=1 time=  1.22 ms
connected to 192.168.247.129:80 (426 bytes), seq=2 time=  1.25 ms
connected to 192.168.247.129:80 (426 bytes), seq=3 time=  1.47 ms
connected to 192.168.247.129:80 (426 bytes), seq=4 time=  1.55 ms
connected to 192.168.247.129:80 (426 bytes), seq=5 time=  1.35 ms
^CGot signal 2
--- http://192.168.247.129/ ping statistics ---
6 connects, 6 ok, 0.00% failed, time 5480ms
round-trip min/avg/max = 1.2/4.0/17.4 ms

[root@localhost zorro]# httping 192.168.247.129
PING 192.168.247.129:80 (/):
connected to 192.168.247.129:80 (426 bytes), seq=0 time=404.59 ms
connected to 192.168.247.129:80 (426 bytes), seq=1 time=403.72 ms
connected to 192.168.247.129:80 (426 bytes), seq=2 time=404.61 ms
connected to 192.168.247.129:80 (426 bytes), seq=3 time=403.73 ms
connected to 192.168.247.129:80 (426 bytes), seq=4 time=404.16 ms
^CGot signal 2
--- http://192.168.247.129/ ping statistics ---
5 connects, 5 ok, 0.00% failed, time 6334ms
round-trip min/avg/max = 403.7/404.2/404.6 ms
```

200ms的网络延时，体现在http协议上会有400ms的rtt时间。此时，网络的速率会成为传输过程的瓶颈，虽然带宽没有下降，但是我们测试一下真实下载速度会发现，带宽无法利用满了：

```
[root@localhost zorro]# wget --no-proxy http://192.168.247.129/bigfile
--2020-04-13 14:37:28--  http://192.168.247.129/bigfile
Connecting to 192.168.247.129:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1073741824 (1.0G)
Saving to: 'bigfile'

bigfile                    15%[=====>                                ] 162.61M  13.4MB/s    eta 87s
```

下载速率稳定在13.4MB/s，离1000mbit/s的真实速率还差的很远。此时就体现出了tcp在大延时网络上的性能瓶颈了。那么如何解决呢？

## 大延时网络提高TCP带宽利用率

我们先来分析一下当前的问题，为什么加大了网络延时会导致tcp带宽利用率下降？

因为我们的带宽是1000mbit/s，做个换算为字节数是125mB/s，当然这是理论值。为了运算方便，我们假定网络带宽就是100mB/s。在这样的带宽下，假定没有buffer影响，网络发送1m数据的速度需要10ms，之后这1m数据需要通过网络发送给对端。然后对端返回接收成功给服务端，服务端接收到写成功之后理解为此次写操作完成，之后发送下一个1m。

在当前网络上我们发现，1m本身之需10ms，但是传输1m到对端在等对端反会接收成功的消息，要至少400ms。因为网络一个rtt时间就是400ms。那么在写1m之后，我们至少要等400ms之后才能发送下一个1M。这样的带宽利用率仅为10ms(数据发送时间)/400ms(rtt等待时间) = 2.5%。这是在没有buffer影响的情况下，实际上我们当前环境是有buffer的，所以当前的带宽利用率要远远大于没有buffer的理论情况。

有了这个理论模型，我们就大概知道应该把buffer调整为多大了，实际上就是应该让一次写操作的数据把网络延时，导致浪费的带宽填满。在延时为400ms，带宽为125mB/s的网络上，要填满延时期间的浪费带宽的字节数该是多少呢？那就是著名的带宽延时积了。即：带宽(125mB/s) X 延时rtt(0.4s) = 50m。

所以，如果一次写可以写满到50m，发送给对方。那么等待的400ms中理论上将不会有带宽未被利用的情况。那么在当前测试环境中，应该调整的就是发送方的tcp_wmem缓存大小。根据上述的各个文件的含义，我们知道只要把/proc/sys/net/ipv4/tcp_wmem文件中的对应值做调整，那么就会有效影响当前服务端的tcp socekt buffer长度。我们来试一下，在centos 8上做如下调整：

```
[root@localhost zorro]# echo 52428800 52428800 52428800 >/proc/sys/net/ipv4/tcp_wmem
[root@localhost zorro]# cat !$
cat /proc/sys/net/ipv4/tcp_wmem
52428800	52428800	52428800
```

然后在fedora 31测试下载速度：

```
[root@localhost zorro]# wget --no-proxy http://192.168.247.129/bigfile
--2020-04-13 15:08:54--  http://192.168.247.129/bigfile
Connecting to 192.168.247.129:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1073741824 (1.0G)
Saving to: 'bigfile'

bigfile                    21%[=======>                              ] 222.25M  14.9MB/s    eta 69s
```

发现目前下载速率稳定在15M/s左右。虽然有所提升，但是依然并没达到真正充分利用带宽的效果。这是为啥呢？理论错了么？

如果我们对TCP理解比较深入的话，我们会知道，TCP传输过程中，真正能决定一次写长度的并不直接受tcp socket wmem的长度影响，严格来说，是受到tcp发送窗口大小的影响。而tcp发送窗口大小还要受到接收端的通告窗口来决定。就是说，tcp发送窗口决定了是不是能填满大延时网络的带宽，而接收端的通告窗口决定了发送窗口有多大。

那么接受方的通告窗口长度是怎么决定的呢？在内核中，使用tcp_select_window()方法来决定通告窗口大小。详细分析这个方法，我们发现，接受方的通告窗口大小会受到接受方本地的tcp socket rmem的剩余长度影响。就是说，在一个tcp链接中，发送窗口受到对端tcp socket rmem剩余长度影响。

所以，除了调整发送方wmem外，还要调整接受方的rmem。我们再来试一下，在fedora 31上执行：

```
[root@localhost zorro]# echo 52428800 52428800 52428800 >/proc/sys/net/ipv4/tcp_rmem
[root@localhost zorro]# cat !$
cat /proc/sys/net/ipv4/tcp_rmem
52428800	52428800	52428800
```

再做下载测试：

```
[root@localhost zorro]# wget --no-proxy http://192.168.247.129/bigfile
--2020-04-13 15:21:40--  http://192.168.247.129/bigfile
Connecting to 192.168.247.129:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1073741824 (1.0G)
Saving to: 'bigfile'

bigfile                   100%[=====================================>]   1.00G  92.7MB/s    in 13s

2020-04-13 15:21:53 (77.8 MB/s) - 'bigfile' saved [1073741824/1073741824]
```

 这时的下载速率才比较符合我们理论中的状况。当然，因为发送窗口大小受到的是“剩余”接收缓存大小影响，所以我们推荐此时应该把/proc/sys/net/ipv4/tcp_rmem的大小调的比理论值更大一些。比如大一倍：

```
[root@localhost zorro]# echo 104857600 104857600 104857600 > /proc/sys/net/ipv4/tcp_rmem
[root@localhost zorro]# cat /proc/sys/net/ipv4/tcp_rmem
104857600	104857600	104857600
[root@localhost zorro]# wget --no-proxy http://192.168.247.129/bigfile
--2020-04-13 15:25:29--  http://192.168.247.129/bigfile
Connecting to 192.168.247.129:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1073741824 (1.0G)
Saving to: 'bigfile'

bigfile                   100%[=====================================>]   1.00G  89.2MB/s    in 13s

2020-04-13 15:25:43 (76.9 MB/s) - 'bigfile' saved [1073741824/1073741824]
```

此时理论上应该获得比刚才更理想的下载速率。另外还有一个文件需要注意：

/proc/sys/net/ipv4/tcp_adv_win_scale

这个值用来影响缓存中有多大空间用来存放overhead相关数据，所谓overhead数据可以理解为比如TCP报头等非业务数据。假设缓存字节数为bytes，这个值说明，有bytes/2的tcp_adv_win_scale次方的空间用来存放overhead数据。默认值为1表示有1/2的缓存空间用来放overhead，此值为二表示1/4的空间。当tcp_adv_win_scale <= 0的时候，overhead空间运算为：bytes-bytes/2^(-tcp_adv_win_scale)。取值范围是：[-31, 31]。

可以在下载过程中使用ss命令查看rcv_space和rcv_ssthresh的变化：

```
[root@localhost zorro]# ss -io state established '( dport = 80 or sport = 80 )'
Netid     Recv-Q     Send-Q           Local Address:Port              Peer Address:Port     Process
tcp       0          0              192.168.247.130:47864          192.168.247.129:http
	 ts sack cubic wscale:7,11 rto:603 rtt:200.748/75.374 ato:40 mss:1448 pmtu:1500 rcvmss:1448 advmss:1448 cwnd:10 bytes_sent:149 bytes_acked:150 bytes_received:448880 segs_out:107 segs_in:312 data_segs_out:1 data_segs_in:310 send 577.0Kbps lastsnd:1061 lastrcv:49 lastack:50 pacing_rate 1.2Mbps delivery_rate 57.8Kbps delivered:2 app_limited busy:201ms rcv_rtt:202.512 rcv_space:115840 rcv_ssthresh:963295 minrtt:200.474
[root@localhost zorro]# ss -io state established '( dport = 80 or sport = 80 )'
Netid     Recv-Q     Send-Q           Local Address:Port              Peer Address:Port     Process
tcp       0          0              192.168.247.130:47864          192.168.247.129:http
	 ts sack cubic wscale:7,11 rto:603 rtt:200.748/75.374 ato:40 mss:1448 pmtu:1500 rcvmss:1448 advmss:1448 cwnd:10 bytes_sent:149 bytes_acked:150 bytes_received:48189440 segs_out:1619 segs_in:33282 data_segs_out:1 data_segs_in:33280 send 577.0Kbps lastsnd:2623 lastrcv:1 lastack:3 pacing_rate 1.2Mbps delivery_rate 57.8Kbps delivered:2 app_limited busy:201ms rcv_rtt:294.552 rcv_space:16550640 rcv_ssthresh:52423872 minrtt:200.474
[root@localhost zorro]# ss -io state established '( dport = 80 or sport = 80 )'
Netid     Recv-Q     Send-Q           Local Address:Port              Peer Address:Port     Process
tcp       0          0              192.168.247.130:47864          192.168.247.129:http
	 ts sack cubic wscale:7,11 rto:603 rtt:200.748/75.374 ato:40 mss:1448 pmtu:1500 rcvmss:1448 advmss:1448 cwnd:10 bytes_sent:149 bytes_acked:150 bytes_received:104552840 segs_out:2804 segs_in:72207 data_segs_out:1 data_segs_in:72205 send 577.0Kbps lastsnd:3221 lastack:601 pacing_rate 1.2Mbps delivery_rate 57.8Kbps delivered:2 app_limited busy:201ms rcv_rtt:286.159 rcv_space:25868520 rcv_ssthresh:52427352 minrtt:200.474
```

## 最后

不想看上述冗长的测试过程的话，可以直接看这里的总结：

从原理上看，一个延时大的网络不应该影响其带宽的利用。之所以大延时网络上的带宽利用率低，主要原因是延时变大之后，发送方发的数据不能及时到达接收方。导致发送缓存满之后，不能再持续发送数据。接收方则因为TCP通告窗口受到接收方剩余缓存大小的影响。接收缓存小的话，则会通告对方发送窗口变小。进而影响发送方不能以大窗口发送数据。所以，这里的调优思路应该是，发送方调大tcp_wmem，接收方调大tcp_rmem。那么调成多大合适呢？如果我们把大延时网络想象成一个缓存的话，那么缓存的大小应该是带宽延时（rtt）积。假设带宽为1000Mbit/s，rtt时间为400ms，那么缓存应该调整为大约50Mbyte左右。接收方tcp_rmem应该更大一些，以便在接受方不能及时处理数据的情况下，不至于产生剩余缓存变小而影响通告窗口导致发送变慢的问题，可以考虑调整为2倍的带宽延时积。在这个例子中就是100M左右。此时在原理上，tcp的吞度量应该能达到高延时网络的带宽上限了。

但是网络环境本身很复杂。首先：网络路径上的一堆网络设备本身会有一定缓存。所以我们大多数情况不用按照上述理论值调整本地的tcp缓存大小。其次，高延时网络一般伴随着丢包几率高。当产生丢包的时候，带宽利用率低就不再只是缓存的影响了。此时拥塞控制本身会导致带宽利用率达不到要求。所以，选择不同的拥塞控制算法，更多影响的是丢包之后的快速恢复过程和慢启动过程的效果。比如，bbr这种对丢包不敏感的拥塞控制算法，在有丢包的情况下，对窗口的影响比其他拥塞控制算法更小。而如果网络仅仅是延时大，丢包很少的话，选什么拥塞控制算法对带宽利用率影响并不大，缓存影响会更大。


----------------------------------

大家好，我是Zorro！

如果你喜欢本文，欢迎在微博上搜索“**orroz**”关注我，地址是：
[https://weibo.com/orroz](https://weibo.com/orroz)

大家也可以在微信上搜索：**Linux系统技术** 关注我的公众号。

我的所有文章都会沉淀在我的个人博客上，地址是：
[https://zorrozou.github.io/](https://zorrozou.github.io/)。

欢迎使用以上各种方式一起探讨学习，共同进步。

公众号二维码：

![Zorro］ icon](http://ww1.sinaimg.cn/mw690/6673053fgw1f31zfw1dprj20by0by0tc.jpg)

----------------------------------


